import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Calendar,
  Bell,
  Clock,
  Plus,
  X,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Banknote
} from 'lucide-react';
import { recurringExpensesAPI, banksAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { showSuccessToast, showErrorToast, handleApiError } from '../utils/errorHandler';

const defaultFormState = {
  name: '',
  description: '',
  amount: '',
  dayOfMonth: 1,
  reminderDaysBefore: 3,
  defaultPaymentType: 'cash',
  expenseAccount: '',
  bank: '',
  notes: '',
  startFromDate: ''
};

const computeDaysUntilDue = (dueDate) => {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const getPayeeLabel = (expense) => {
  if (expense?.supplier) {
    return (
      expense.supplier.displayName ||
      expense.supplier.companyName ||
      expense.supplier.businessName ||
      expense.supplier.name
    );
  }

  if (expense?.customer) {
    return (
      expense.customer.displayName ||
      expense.customer.businessName ||
      expense.customer.name ||
      [expense.customer.firstName, expense.customer.lastName].filter(Boolean).join(' ')
    );
  }

  return 'General Expense';
};

const RecurringExpensesPanel = ({ expenseAccounts = [], onPaymentRecorded }) => {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState(defaultFormState);
  const [reminderWindow, setReminderWindow] = useState(7);

  const {
    data: upcomingData,
    isLoading: upcomingLoading,
    isFetching: upcomingFetching
  } = useQuery(
    ['recurringExpensesUpcoming', reminderWindow],
    () => recurringExpensesAPI.getUpcoming({ days: reminderWindow }),
    {
      keepPreviousData: true,
      refetchInterval: 60_000
    }
  );

  const {
    data: activeData,
    isLoading: activeLoading
  } = useQuery(
    ['recurringExpensesList'],
    () => recurringExpensesAPI.getRecurringExpenses({ status: 'active' }),
    {
      keepPreviousData: true
    }
  );

  const {
    data: banksData,
    isLoading: banksLoading
  } = useQuery(
    ['banks', { isActive: true }],
    () => banksAPI.getBanks({ isActive: true }),
    {
      staleTime: 5 * 60_000
    }
  );

  const normalizeExpenses = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.expenses)) return payload.expenses;
    if (Array.isArray(payload?.data?.recurringExpenses)) return payload.data.recurringExpenses;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    return [];
  };

  const upcomingExpenses = useMemo(() => normalizeExpenses(upcomingData), [upcomingData]);
  const activeExpenses = useMemo(() => normalizeExpenses(activeData), [activeData]);

  const bankOptions = useMemo(
    () => banksData?.data?.banks || banksData?.banks || [],
    [banksData]
  );

  const expenseAccountOptions = useMemo(
    () => (Array.isArray(expenseAccounts) ? expenseAccounts : []),
    [expenseAccounts]
  );

  const resetForm = () => {
    setFormData(defaultFormState);
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries('recurringExpensesUpcoming');
    queryClient.invalidateQueries('recurringExpensesList');
    queryClient.invalidateQueries('cashPayments');
    queryClient.invalidateQueries('bankPayments');
  };

  const createRecurringMutation = useMutation(
    (payload) => recurringExpensesAPI.createRecurringExpense(payload),
    {
      onSuccess: () => {
        showSuccessToast('Recurring expense created');
        invalidateQueries();
        setShowCreateForm(false);
        resetForm();
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  const recordPaymentMutation = useMutation(
    ({ id, payload }) => recurringExpensesAPI.recordPayment(id, payload),
    {
      onSuccess: (response) => {
        showSuccessToast('Payment recorded successfully');
        invalidateQueries();
        if (typeof onPaymentRecorded === 'function') {
          onPaymentRecorded(response?.data);
        }
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  const deactivateMutation = useMutation(
    (id) => recurringExpensesAPI.deactivateRecurringExpense(id),
    {
      onSuccess: () => {
        showSuccessToast('Recurring expense deactivated');
        invalidateQueries();
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  const snoozeMutation = useMutation(
    ({ id, payload }) => recurringExpensesAPI.snoozeRecurringExpense(id, payload),
    {
      onSuccess: () => {
        showSuccessToast('Reminder updated');
        invalidateQueries();
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  const handleExpenseSelect = (accountId) => {
    const selectedAccount = expenseAccountOptions.find((account) => account._id === accountId);
    setFormData((prev) => ({
      ...prev,
      expenseAccount: accountId,
      name: selectedAccount ? selectedAccount.accountName : ''
    }));
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();

    if (!formData.expenseAccount) {
      showErrorToast('Please select an expense account');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description?.trim() || undefined,
      amount: parseFloat(formData.amount),
      dayOfMonth: Number(formData.dayOfMonth),
      reminderDaysBefore: Number(formData.reminderDaysBefore),
      defaultPaymentType: formData.defaultPaymentType,
      expenseAccount: formData.expenseAccount || undefined,
      bank: formData.defaultPaymentType === 'bank' ? formData.bank || undefined : undefined,
      notes: formData.notes?.trim() || undefined,
      startFromDate: formData.startFromDate || undefined
    };

    createRecurringMutation.mutate(payload);
  };

  const handleRecordPayment = (expense) => {
    recordPaymentMutation.mutate({
      id: expense._id,
      payload: {
        paymentType: expense.defaultPaymentType,
        notes: `Recurring payment for ${expense.name}`
      }
    });
  };

  const handleSnooze = (expense, days = 3) => {
    snoozeMutation.mutate({
      id: expense._id,
      payload: { snoozeDays: days }
    });
  };

  const handleDeactivate = (expenseId) => {
    deactivateMutation.mutate(expenseId);
  };

  const isSubmitting =
    createRecurringMutation.isLoading ||
    recordPaymentMutation.isLoading ||
    deactivateMutation.isLoading ||
    snoozeMutation.isLoading;

  return (
    <div className="card">
      <div className="card-header flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <Bell className="h-5 w-5 text-primary-600" />
            <span>Recurring Expense Reminders</span>
          </h2>
          <p className="text-sm text-gray-600">
            Track monthly obligations and record payments in a single click.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Show next</label>
          <select
            value={reminderWindow}
            onChange={(e) => setReminderWindow(Number(e.target.value))}
            className="input w-24"
          >
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries('recurringExpensesUpcoming')}
            className="btn btn-light flex items-center space-x-1"
            disabled={upcomingFetching}
          >
            <RefreshCw className={`h-4 w-4 ${upcomingFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? 'Close' : 'Add Recurring Expense'}
          </button>
        </div>
      </div>

      <div className="card-content space-y-6">
        {showCreateForm && (
          <div className="border border-dashed border-primary-200 rounded-lg p-4 bg-primary-50/40">
            <h3 className="text-sm font-semibold text-primary-700 flex items-center space-x-2 mb-3">
              <Plus className="h-4 w-4" />
              <span>Create Recurring Expense</span>
            </h3>
            <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Expense Account*</label>
                <select
                  className="input"
                  value={formData.expenseAccount}
                  onChange={(e) => handleExpenseSelect(e.target.value)}
                  required
                >
                  <option value="">Select expense account</option>
                  {expenseAccountOptions.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.accountName} ({account.accountCode})
                    </option>
                  ))}
                </select>
                {formData.name && (
                  <p className="text-xs text-gray-500 mt-1">Selected: {formData.name}</p>
                )}
              </div>
              <div>
                <label className="form-label">Amount*</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="form-label">Due Day of Month*</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="input"
                  value={formData.dayOfMonth}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    dayOfMonth: Number(e.target.value)
                  }))}
                  required
                />
              </div>
              <div>
                <label className="form-label">Reminder (days before)</label>
                <input
                  type="number"
                  min="0"
                  max="31"
                  className="input"
                  value={formData.reminderDaysBefore}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    reminderDaysBefore: Number(e.target.value)
                  }))}
                />
              </div>
              <div>
                <label className="form-label">Default Payment Type*</label>
                <select
                  className="input"
                  value={formData.defaultPaymentType}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      defaultPaymentType: e.target.value,
                      bank: e.target.value === 'bank' ? prev.bank : ''
                    }))
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <div>
                <label className="form-label">Start From</label>
                <input
                  type="date"
                  className="input"
                  value={formData.startFromDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, startFromDate: e.target.value }))
                  }
                />
              </div>
              {formData.defaultPaymentType === 'bank' && (
                <div>
                  <label className="form-label">Bank Account*</label>
                  <select
                    className="input"
                    value={formData.bank}
                    onChange={(e) => setFormData((prev) => ({ ...prev, bank: e.target.value }))}
                    required
                    disabled={banksLoading}
                  >
                    <option value="">Select bank account</option>
                    {bankOptions.map((bank) => (
                      <option key={bank._id} value={bank._id}>
                        {bank.bankName} • {bank.accountNumber}
                        {bank.accountName ? ` (${bank.accountName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="form-label">Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => {
                    setShowCreateForm(false);
                    resetForm();
                  }}
                  disabled={createRecurringMutation.isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !formData.amount || !formData.expenseAccount}
                >
                  {createRecurringMutation.isLoading ? 'Saving...' : 'Save Recurring Expense'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                <Clock className="h-4 w-4 text-primary-500" />
                <span>Upcoming</span>
              </h3>
              {(upcomingLoading || upcomingFetching) && (
                <span className="text-xs text-gray-500">Loading...</span>
              )}
            </div>
            {upcomingExpenses.length === 0 ? (
              <div className="text-center text-sm text-gray-500 bg-white border border-dashed border-gray-200 rounded-lg py-6">
                <CheckCircle className="h-5 w-5 mx-auto text-success-500 mb-2" />
                <p>No reminders due in the next {reminderWindow} days.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingExpenses.map((expense) => {
                  const daysLeft = computeDaysUntilDue(expense.nextDueDate);
                  const isOverdue = typeof daysLeft === 'number' && daysLeft < 0;
                  return (
                    <div
                      key={expense._id}
                      className={`rounded-lg border bg-white p-4 shadow-sm ${
                        isOverdue ? 'border-danger-200 bg-danger-50/40' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-gray-900">{expense.name}</h4>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary-100 text-primary-700">
                              {expense.defaultPaymentType === 'bank' ? 'Bank' : 'Cash'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {formatCurrency(expense.amount)} • Due {formatDate(expense.nextDueDate)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {getPayeeLabel(expense)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div
                            className={`flex items-center space-x-1 text-sm font-semibold ${
                              isOverdue ? 'text-danger-600' : 'text-primary-600'
                            }`}
                          >
                            {isOverdue ? (
                              <>
                                <AlertTriangle className="h-4 w-4" />
                                <span>{Math.abs(daysLeft)} day(s) overdue</span>
                              </>
                            ) : (
                              <>
                                <Calendar className="h-4 w-4" />
                                <span>{daysLeft} day(s) left</span>
                              </>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              type="button"
                              className="btn btn-secondary flex items-center space-x-1"
                              onClick={() => handleSnooze(expense, 3)}
                              disabled={isSubmitting}
                            >
                              <Clock className="h-4 w-4" />
                              <span>Snooze 3d</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary flex items-center space-x-1"
                              onClick={() => handleRecordPayment(expense)}
                              disabled={isSubmitting}
                            >
                              <Banknote className="h-4 w-4" />
                              <span>Record Payment</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span>Active Recurring Expenses</span>
              </h3>
              {activeLoading && <span className="text-xs text-gray-500">Loading...</span>}
            </div>
            {activeExpenses.length === 0 ? (
              <div className="text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg py-6">
                <p>No recurring expenses configured yet.</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y">
                {activeExpenses.map((expense) => (
                  <div key={expense._id} className="py-3 flex items-start justify-between space-x-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{expense.name}</p>
                      <p className="text-xs text-gray-500">
                        Due every month on day {expense.dayOfMonth} •{' '}
                        {expense.reminderDaysBefore} day(s) reminder
                      </p>
                      <p className="text-xs text-gray-500">
                        Next: {formatDate(expense.nextDueDate)} • {formatCurrency(expense.amount)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        className="btn btn-light text-xs"
                        onClick={() => handleSnooze(expense, 30)}
                        disabled={isSubmitting}
                      >
                        Skip Month
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={() => handleDeactivate(expense._id)}
                        disabled={isSubmitting}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecurringExpensesPanel;


