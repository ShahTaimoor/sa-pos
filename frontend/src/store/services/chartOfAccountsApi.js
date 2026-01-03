import { api } from '../api';

export const chartOfAccountsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAccounts: builder.query({
      query: (params) => ({
        url: 'chart-of-accounts',
        method: 'get',
        params,
      }),
      providesTags: (result) => {
        const accounts = Array.isArray(result) ? result : (result?.data?.accounts || result?.accounts || []);
        return accounts.length
          ? [
              ...accounts.map(({ _id, id }) => ({ type: 'ChartOfAccounts', id: _id || id })),
              { type: 'ChartOfAccounts', id: 'LIST' },
            ]
          : [{ type: 'ChartOfAccounts', id: 'LIST' }];
      },
    }),
    getAccount: builder.query({
      query: (id) => ({
        url: `chart-of-accounts/${id}`,
        method: 'get',
      }),
      providesTags: (_r, _e, id) => [{ type: 'ChartOfAccounts', id }],
    }),
    createAccount: builder.mutation({
      query: (data) => ({
        url: 'chart-of-accounts',
        method: 'post',
        data,
      }),
      invalidatesTags: [{ type: 'ChartOfAccounts', id: 'LIST' }],
    }),
    updateAccount: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `chart-of-accounts/${id}`,
        method: 'put',
        data,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'ChartOfAccounts', id },
        { type: 'ChartOfAccounts', id: 'LIST' },
      ],
    }),
    deleteAccount: builder.mutation({
      query: (id) => ({
        url: `chart-of-accounts/${id}`,
        method: 'delete',
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'ChartOfAccounts', id },
        { type: 'ChartOfAccounts', id: 'LIST' },
      ],
    }),
    getAccountHierarchy: builder.query({
      query: () => ({
        url: 'chart-of-accounts/hierarchy',
        method: 'get',
      }),
      providesTags: [{ type: 'ChartOfAccounts', id: 'HIERARCHY' }],
    }),
    getAccountStats: builder.query({
      query: () => ({
        url: 'chart-of-accounts/stats/summary',
        method: 'get',
      }),
      providesTags: [{ type: 'ChartOfAccounts', id: 'STATS' }],
    }),
    getCategoriesGrouped: builder.query({
      query: () => ({
        url: 'account-categories/grouped',
        method: 'get',
      }),
      providesTags: [{ type: 'ChartOfAccounts', id: 'CATEGORIES' }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAccountsQuery,
  useGetAccountQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useGetAccountHierarchyQuery,
  useGetAccountStatsQuery,
  useGetCategoriesGroupedQuery,
} = chartOfAccountsApi;

