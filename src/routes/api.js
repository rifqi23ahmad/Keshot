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
}

module.exports = apiRoutes;
