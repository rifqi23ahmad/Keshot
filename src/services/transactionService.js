const supabase = require('../lib/supabase');

async function getSummary(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId);

  if (error) throw error;

  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of data) {
    if (t.type === 'income') totalIncome += t.amount;
    if (t.type === 'expense') totalExpense += t.amount;
  }

  const balance = totalIncome - totalExpense;
  return { totalIncome, totalExpense, balance };
}

async function getHistory(userId, page = 1, limit = 10) {
  const offset = (page - 1) * limit;

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // request 11 items to check next page

  if (error) throw error;

  const hasNextPage = transactions && transactions.length > limit;
  const displayTransactions = transactions ? transactions.slice(0, limit) : [];

  return { transactions: displayTransactions, hasNextPage, offset };
}

function getTodayRange() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  
  return { start: startOfDay.toISOString(), end: endOfDay.toISOString() };
}

async function getTodaySummary(userId) {
  const { start, end } = getTodayRange();
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) throw error;

  let totalIncome = 0;
  let totalExpense = 0;
  if (data) {
    for (const t of data) {
      if (t.type === 'income') totalIncome += t.amount;
      if (t.type === 'expense') totalExpense += t.amount;
    }
  }

  return { totalIncome, totalExpense };
}

async function getTodayHistory(userId, page = 1, limit = 10) {
  const { start, end } = getTodayRange();
  const offset = (page - 1) * limit;

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) throw error;

  const hasNextPage = transactions && transactions.length > limit;
  const displayTransactions = transactions ? transactions.slice(0, limit) : [];

  return { transactions: displayTransactions, hasNextPage, offset };
}

async function addTransaction(transactionData) {
  // Can be a single object or an array of objects
  const { data, error } = await supabase
    .from('transactions')
    .insert(transactionData);

  if (error) throw error;
  return data;
}

async function deleteTransactions(userId, transactionIds) {
  const idsArray = Array.from(transactionIds); // Set to Array if needed
  if (idsArray.length === 0) return { deletedCount: 0 };

  const { error } = await supabase
    .from('transactions')
    .delete()
    .in('id', idsArray)
    .eq('user_id', userId);

  if (error) throw error;
  return { deletedCount: idsArray.length };
}

module.exports = {
  getSummary,
  getHistory,
  getTodaySummary,
  getTodayHistory,
  addTransaction,
  deleteTransactions
};
