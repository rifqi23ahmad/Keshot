const supabase = require('../lib/supabase');
const membershipCache = require('../lib/authCache');
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isGroupMember(telegramId) {
  const REQUIRED_GROUP = process.env.REQUIRED_GROUP_ID; 
  if (!REQUIRED_GROUP) return true; // Disabled if not set

  const idStr = String(telegramId);
  const cached = await membershipCache.getMembership(idStr);
  if (cached) {
    return cached.isMember;
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
     await membershipCache.setMembership(idStr, isMember, CACHE_TTL / 1000);
     return isMember;
  } catch(e) {
     return false; // fail closed to prevent loopholes
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

  // History endpoint for specific week offset (0 = this week, -1 = last week, etc.)
  server.get('/history/weekly', async (request, reply) => {
    const { telegramId, offset } = request.query;

    if (!telegramId || offset === undefined) {
      return reply.code(400).send({ error: 'telegramId and offset are required' });
    }

    try {
      const [isMember, userRes] = await Promise.all([
        isGroupMember(telegramId),
        supabase.from('users').select('id').eq('telegram_id', telegramId.toString()).single()
      ]);

      if (!isMember) return reply.code(403).send({ error: 'Akses Ditolak' });
      const { data: user, error: userError } = userRes;
      if (userError || !user) return reply.code(404).send({ error: 'User not found' });

      // Calculate date range securely
      const intOffset = parseInt(offset, 10) || 0;
      
      const now = new Date();
      // Get current day of week (0=Sun, 1=Mon, ..., 6=Sat)
      const currentDay = now.getDay();
      // Calculate days to subtract to get to Monday (if Sunday, subtract 6, else subtract currentDay - 1)
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
      
      // Calculate Monday of the current week (midnight)
      const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      // Apply offset (7 days per offset)
      const targetMonday = new Date(currentMonday.getTime() + intOffset * 7 * 24 * 60 * 60 * 1000);
      
      // Sunday of that week (end of day)
      const targetSunday = new Date(targetMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
      targetSunday.setHours(23, 59, 59, 999);

      const startDate = targetMonday.toISOString();
      const endDate = targetSunday.toISOString();

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
        income: mIncome,
        expense: mExpense,
        startDate: startDate,
        endDate: endDate
      });
    } catch (err) {
      server.log.error(err);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Edit Transaction by ID
  server.put('/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const { telegramId, amount, category, note, type } = request.body;

    if (!telegramId) return reply.code(400).send({ error: 'telegramId required' });
    
    try {
      const [isMember, userRes] = await Promise.all([
        isGroupMember(telegramId),
        supabase.from('users').select('id').eq('telegram_id', telegramId.toString()).single()
      ]);

      if (!isMember) return reply.code(403).send({ error: 'Akses Ditolak' });
      if (userRes.error || !userRes.data) return reply.code(404).send({ error: 'User not found' });

      // Cek umur transaksi
      const { data: tx, error: txError } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (txError || !tx) return reply.code(404).send({ error: 'Transaksi tidak ditemukan' });

      if (tx.user_id !== userRes.data.id) return reply.code(403).send({ error: 'Akses ditolak' });

      const txDate = new Date(tx.created_at);
      const now = new Date();
      const diffMs = now - txDate;
      const daysDiff = diffMs / (1000 * 60 * 60 * 24);

      if (daysDiff > 30) {
        return reply.code(400).send({ error: 'Transaksi berusia lebih dari 30 hari tidak dapat diedit.' });
      }

      const updateData = {};
      if (amount !== undefined) updateData.amount = Number(amount);
      if (category !== undefined) updateData.category = category;
      if (note !== undefined) updateData.note = note;
      if (type !== undefined) updateData.type = type;

      const { data: updatedTx, error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
         server.log.error(updateError);
         return reply.code(500).send({ error: 'Database update failed' });
      }

      return reply.send({ success: true, transaction: updatedTx });
    } catch (err) {
      server.log.error(err);
      return reply.code(500).send({ error: 'Internal error' });
    }
  });
}

module.exports = apiRoutes;
