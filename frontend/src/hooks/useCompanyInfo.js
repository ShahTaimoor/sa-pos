import { useQuery } from 'react-query';
import { settingsAPI } from '../services/api';

export const useCompanyInfo = (options = {}) => {
  const queryResult = useQuery(
    'companySettings',
    settingsAPI.getCompanySettings,
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      ...options
    }
  );

  const companyInfo = queryResult.data?.data || {};

  return {
    ...queryResult,
    companyInfo
  };
};

