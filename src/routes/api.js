const supabase = require('../lib/supabase');

const membershipCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isGroupMember(telegramId) {
  const REQUIRED_GROUP = process.env.REQUIRED_GROUP_ID; 
  if (!REQUIRED_GROUP) return true; // Disabled if not set

  const now = Date.now();
  if (membershipCache.has(telegramId)) {
    const cached = membershipCache.get(telegramId);
    if (now < cached.expiresAt) return cached.isMember;
  }

  try {
     const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${REQUIRED_GROUP}&user_id=${telegramId}`;
     const res = await fetch(url);
     const data = await res.json();
     let isMember = false;
     if (data.ok) {
        const status = data.result.status;
        if (['creator', 'administrator', 'member', 'restricted'].includes(status)) {
            isMember = true; 
        }
     }
     membershipCache.set(telegramId, { isMember, expiresAt: now + CACHE_TTL });
     return isMember;
  } catch(e) {
     return true; // fail open
  }
}

async function apiRoutes(server, options) {
  server.get('/dashboard', async (request, reply) => {
    const telegramId = request.query.telegramId;
    
    if (!telegramId) {
      return reply.code(400).send({ error: 'telegramId is required' });
    }

    try {
      // 1. Concurrently check membership AND get user ID from Supabase
      const [isMember, userRes] = await Promise.all([
        isGroupMember(telegramId),
        supabase.from('users').select('id').eq('telegram_id', telegramId.toString()).single()
      ]);

      if (!isMember) {
        return reply.code(403).send({ error: 'Akses Ditolak' });
      }

      const { data: user, error: userError } = userRes;

      if (userError || !user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // 2. Concurrently fetch Totals AND Recent Transactions
      const [allTxRes, recentTxRes] = await Promise.all([
        supabase.from('transactions').select('type, amount').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      if (allTxRes.error) {
        server.log.error(allTxRes.error);
        return reply.code(500).send({ error: 'Database error' });
      }

      if (recentTxRes.error) {
        server.log.error(recentTxRes.error);
        return reply.code(500).send({ error: 'Database error' });
      }

      let totalIncome = 0;
      let totalExpense = 0;

      for (const t of allTxRes.data) {
        if (t.type === 'income') totalIncome += t.amount;
        if (t.type === 'expense') totalExpense += t.amount;
      }

      const totalBalance = totalIncome - totalExpense;

      // 4. Send response
      return reply.send({
        totalBalance,
        totalIncome,
        totalExpense,
        recentTransactions: recentTxRes.data
      });

    } catch (err) {
      server.log.error(err);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // History endpoint for specific month
  server.get('/history', async (request, reply) => {
    const { telegramId, month, year } = request.query;

    if (!telegramId || !month || !year) {
      return reply.code(400).send({ error: 'telegramId, month, and year are required' });
    }

    try {
      const [isMember, userRes] = await Promise.all([
        isGroupMember(telegramId),
        supabase.from('users').select('id').eq('telegram_id', telegramId.toString()).single()
      ]);

      if (!isMember) {
        return reply.code(403).send({ error: 'Akses Ditolak' });
      }
      
      const { data: user, error: userError } = userRes;

      if (userError || !user) return reply.code(404).send({ error: 'User not found' });

      // Calculate date range securely
      const intYear = parseInt(year, 10);
      const intMonth = parseInt(month, 10);
      
      const startDate = new Date(intYear, intMonth - 1, 1).toISOString();
      const endDate = new Date(intYear, intMonth, 0, 23, 59, 59, 999).toISOString();

      const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (txError) {
        server.log.error(txError);
        return reply.code(500).send({ error: 'Database error' });
      }

      let mIncome = 0;
      let mExpense = 0;

      for (const t of txs) {
        if (t.type === 'income') mIncome += t.amount;
        if (t.type === 'expense') mExpense += t.amount;
      }

      return reply.send({ 
        transactions: txs,
        monthlyIncome: mIncome,
        monthlyExpense: mExpense
      });
    } catch (err) {
      server.log.error(err);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}

module.exports = apiRoutes;
