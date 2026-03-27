const supabase = require('../lib/supabase');

async function apiRoutes(server, options) {
  server.get('/dashboard', async (request, reply) => {
    const telegramId = request.query.telegramId;
    
    if (!telegramId) {
      return reply.code(400).send({ error: 'telegramId is required' });
    }

    try {
      // 1. Get user ID from Supabase
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId.toString())
        .single();

      if (userError || !user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // 2. Fetch all transactions for totals
      const { data: allTx, error: txError } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id);

      if (txError) {
        server.log.error(txError);
        return reply.code(500).send({ error: 'Database error' });
      }

      let totalIncome = 0;
      let totalExpense = 0;

      for (const t of allTx) {
        if (t.type === 'income') totalIncome += t.amount;
        if (t.type === 'expense') totalExpense += t.amount;
      }

      const totalBalance = totalIncome - totalExpense;

      // 3. Fetch 5 most recent transactions
      const { data: recentTx, error: recentError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentError) {
        server.log.error(recentError);
        return reply.code(500).send({ error: 'Database error' });
      }

      // 4. Send response
      return reply.send({
        totalBalance,
        totalIncome,
        totalExpense,
        recentTransactions: recentTx
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
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId.toString())
        .single();

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
