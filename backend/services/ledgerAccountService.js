const mongoose = require('mongoose');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const SupplierRepository = require('../repositories/SupplierRepository');
const AccountingService = require('./accountingService');
const Counter = require('../models/Counter'); // Keep for findOneAndUpdate with upsert
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger'); // Keep for instance creation

const isStatusActive = (status) => {
  if (!status) return true;
  return status === 'active';
};

const generateSequentialCode = async (counterKey, prefix, session) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );

  return `${prefix}${String(counter.seq).padStart(4, '0')}`;
};

const createLedgerAccount = async ({
  prefix,
  counterKey,
  accountName,
  accountType,
  accountCategory,
  normalBalance,
  tags = [],
  status,
  userId,
  tenantId,
  session
}) => {
  const accountCode = await generateSequentialCode(counterKey, prefix, session);
  const accountData = {
    accountCode,
    accountName,
    accountType,
    accountCategory,
    normalBalance,
    tenantId: tenantId,
    allowDirectPosting: true,
    isActive: isStatusActive(status),
    tags,
    description: 'Auto-generated party ledger account',
    createdBy: userId || undefined,
    updatedBy: userId || undefined
  };

  try {
    const account = new ChartOfAccounts(accountData);
    await account.save({ session });
    return account;
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error - account already exists, fetch and return it
      logger.info('Duplicate accountCode, fetching existing account:', accountCode);
      const existingAccount = await ChartOfAccountsRepository.findOne(
        { accountCode },
        { session }
      );
      if (existingAccount) {
        return existingAccount;
      }
      // If not found, try upsert approach (using model directly for upsert)
      const updateOptions = session ? { session } : {};
      await ChartOfAccounts.updateOne(
        { accountCode },
        { $setOnInsert: accountData },
        { upsert: true, ...updateOptions }
      );
      return await ChartOfAccountsRepository.findOne(
        { accountCode },
        { session }
      );
    }
    throw err;
  }
};

const syncCustomerLedgerAccount = async (customer, { session, userId } = {}) => {
  if (!customer) return null;
  
  const tenantId = customer.tenantId;
  if (!tenantId) {
    throw new Error('Customer must have tenantId');
  }

  // Find or get the general "Accounts Receivable" account
  // Try multiple possible account codes/names that might exist (dynamic lookup)
  const possibleAccountCodes = ['1130', '1201', '1200', '1100'];
  const accountNamePatterns = [
    /^Accounts Receivable$/i,
    /^Account Receivable$/i,
    /^AR$/i,
    /^Receivables$/i
  ];

  let accountsReceivableAccount = null;
  
  // First, try to find by account code (use session if provided to maintain transaction consistency)
  for (const code of possibleAccountCodes) {
    const upperCode = code.toUpperCase();
    accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
      { tenantId: tenantId, accountCode: upperCode, isActive: true, isDeleted: false },
      session ? { session } : {}
    );
    if (accountsReceivableAccount) break;
  }

  // If not found by code, try to find by name pattern (use session if provided)
  if (!accountsReceivableAccount) {
    for (const pattern of accountNamePatterns) {
      // Try with isActive: true first
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          tenantId: tenantId,
          accountName: { $regex: pattern },
          accountType: 'asset',
          accountCategory: 'current_assets',
          isActive: true,
          isDeleted: false
        },
        session ? { session } : {}
      );
      if (accountsReceivableAccount) break;
      
      // If not found, try without isActive filter (might be inactive)
      if (!accountsReceivableAccount) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            tenantId: tenantId,
            accountName: { $regex: pattern },
            accountType: 'asset',
            accountCategory: 'current_assets',
            isDeleted: false
          },
          session ? { session } : {}
        );
        if (accountsReceivableAccount) {
          // Reactivate if found but inactive
          accountsReceivableAccount.isActive = true;
          await accountsReceivableAccount.save(session ? { session } : undefined);
          break;
        }
      }
    }
  }

  // If still not found, try broader search (any asset account with receivable in name)
  if (!accountsReceivableAccount) {
    accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
      {
        tenantId: tenantId,
        accountName: { $regex: /receivable/i },
        accountType: 'asset',
        isActive: true,
        isDeleted: false
      },
      session ? { session } : {}
    );
  }

  // If Accounts Receivable doesn't exist, create it dynamically
  if (!accountsReceivableAccount) {
    // SIMPLIFIED APPROACH: Find available code for this tenant, avoiding conflicts
    let accountCode = null;
    let codeFound = false;
    
    // Step 1: Try to find existing Accounts Receivable account for this tenant (any code)
    // This handles cases where account exists but with different code
    try {
      const existingAR = await ChartOfAccountsRepository.findOne(
        {
          tenantId: tenantId,
          accountName: { $regex: /^Accounts Receivable$/i },
          accountType: 'asset'
        }
      );
      if (existingAR) {
        // Found existing AR account for this tenant - use it
        if (existingAR.isDeleted) {
          existingAR.isDeleted = false;
          existingAR.isActive = true;
          await existingAR.save();
        }
        accountsReceivableAccount = existingAR;
        logger.info('Found existing Accounts Receivable account for tenant');
        // Skip creation, we have the account
      }
    } catch (findError) {
      logger.warn('Error finding existing AR account:', findError.message);
    }
    
    // Step 2: If no account found, find an available code for this tenant
    // IMPORTANT: Check GLOBALLY (any tenant) because there might be a unique index on accountCode alone
    if (!accountsReceivableAccount) {
      // Try each possible code to find one that's available GLOBALLY (not just for this tenant)
      for (const code of possibleAccountCodes) {
        const codeUpper = code.toUpperCase();
        try {
          // FIRST: Check if this code exists GLOBALLY (any tenant) - this is critical!
          const globalExisting = await ChartOfAccountsRepository.findOne(
            { accountCode: codeUpper } // Check globally without tenantId
          );
          
          if (!globalExisting) {
            // Code doesn't exist globally - it's available! Use it
            accountCode = codeUpper;
            codeFound = true;
            logger.info(`Found available account code globally: ${accountCode}`);
            break;
          } else {
            // Code exists globally - check if it's for THIS tenant
            if (globalExisting.tenantId && globalExisting.tenantId.toString() === tenantId.toString()) {
              // It's for this tenant - check if it's an AR account we can use
              if (globalExisting.accountName && globalExisting.accountName.toLowerCase().includes('receivable')) {
                if (globalExisting.isDeleted) {
                  globalExisting.isDeleted = false;
                  globalExisting.isActive = true;
                  await globalExisting.save();
                }
                accountsReceivableAccount = globalExisting;
                logger.info(`Found existing AR account with code ${codeUpper} for this tenant`);
                break;
              }
              // Code exists for this tenant but not AR - continue to next code
            } else {
              // Code exists for DIFFERENT tenant - can't use it (unique index on accountCode)
              logger.warn(`Code ${codeUpper} exists for different tenant, skipping`);
              // Continue to next code
            }
          }
        } catch (checkError) {
          logger.warn(`Error checking code ${codeUpper}:`, checkError.message);
          // Continue to next code
        }
      }
      
      // Step 3: If no code found from list, search in 1100-1199 range (checking globally)
      if (!accountsReceivableAccount && !codeFound) {
        for (let i = 1100; i <= 1199; i++) {
          const code = String(i).toUpperCase();
          try {
            // Check globally first
            const globalExisting = await ChartOfAccountsRepository.findOne(
              { accountCode: code }
            );
            if (!globalExisting) {
              // Code doesn't exist globally - use it
              accountCode = code;
              codeFound = true;
              logger.info(`Found available code globally in range: ${accountCode}`);
              break;
            } else if (globalExisting.tenantId && globalExisting.tenantId.toString() === tenantId.toString()) {
              // Exists for this tenant - check if it's AR
              if (globalExisting.accountName && globalExisting.accountName.toLowerCase().includes('receivable')) {
                if (globalExisting.isDeleted) {
                  globalExisting.isDeleted = false;
                  globalExisting.isActive = true;
                  await globalExisting.save();
                }
                accountsReceivableAccount = globalExisting;
                logger.info(`Found existing AR account with code ${code} for this tenant`);
                break;
              }
            }
            // Code exists for different tenant - continue searching
          } catch (rangeError) {
            // Continue searching
          }
        }
      }
      
      // Step 4: If still no code found, we MUST find one - try higher range
      if (!accountsReceivableAccount && !codeFound) {
        logger.warn('No code found in 1100-1199 range, trying 1200-1299');
        for (let i = 1200; i <= 1299; i++) {
          const code = String(i).toUpperCase();
          try {
            const globalExisting = await ChartOfAccountsRepository.findOne(
              { accountCode: code }
            );
            if (!globalExisting) {
              accountCode = code;
              codeFound = true;
              logger.info(`Found available code in extended range: ${accountCode}`);
              break;
            }
          } catch (extendedError) {
            // Continue
          }
        }
      }
      
      // Final fallback: If still no code, we have a problem
      if (!accountCode) {
        throw new Error(
          'Cannot find available account code for Accounts Receivable. ' +
          'All codes in range 1100-1299 are taken. Please manually create an Accounts Receivable account.'
        );
      }

      // Only try to create if we don't have an account yet
      if (!accountsReceivableAccount) {
        const accountData = {
          accountCode: accountCode,
          accountName: 'Accounts Receivable',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          tenantId: tenantId,
          allowDirectPosting: true,
          isActive: true,
          isSystemAccount: true,
          description: 'Money owed by customers - General Accounts Receivable account',
          createdBy: userId || undefined,
          currentBalance: 0,
          openingBalance: 0
        };
        
        try {
          // First, try to create directly using the model (most reliable)
          try {
            const newAccount = new ChartOfAccounts(accountData);
            const saveOptions = session ? { session } : {};
            await newAccount.save(saveOptions);
            accountsReceivableAccount = newAccount;
            logger.info('Successfully created Accounts Receivable account:', accountCode);
          } catch (createError) {
            // If creation fails due to duplicate, try fetching (use session if provided)
            if (createError.code === 11000 || createError.codeName === 'DuplicateKey' || 
                (createError.name === 'MongoServerError' && createError.message?.includes('duplicate key'))) {
              logger.info('Account already exists, fetching:', accountCode);
              // Always use session if provided to maintain transaction consistency
              accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                { tenantId: tenantId, accountCode: accountCode, isDeleted: false },
                session ? { session } : {}
              );
              
              // If not found with session, try without session (in case transaction was aborted)
              if (!accountsReceivableAccount && session) {
                logger.warn('Account not found with session, trying without session');
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { tenantId: tenantId, accountCode: accountCode, isDeleted: false }
                );
              }
              
              // If still not found, try without isDeleted filter (might be soft-deleted)
              if (!accountsReceivableAccount) {
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { tenantId: tenantId, accountCode: accountCode },
                  session ? { session } : {}
                );
                // If found but deleted, reactivate it
                if (accountsReceivableAccount && accountsReceivableAccount.isDeleted) {
                  accountsReceivableAccount.isDeleted = false;
                  accountsReceivableAccount.isActive = true;
                  await accountsReceivableAccount.save(session ? { session } : {});
                  logger.info('Reactivated deleted Accounts Receivable account');
                }
              }
              
              // If still not found, check if account exists for DIFFERENT tenant
              if (!accountsReceivableAccount) {
                const globalAccount = await ChartOfAccountsRepository.findOne(
                  { accountCode: accountCode } // Check without tenantId
                );
                
                if (globalAccount) {
                  // Account exists but for different tenant
                  if (globalAccount.tenantId && globalAccount.tenantId.toString() !== tenantId.toString()) {
                    logger.warn(`Account ${accountCode} exists for different tenant (${globalAccount.tenantId}), finding new code for tenant ${tenantId}`);
                    
                    // Find available code for THIS tenant
                    let newCode = null;
                    for (let i = 1100; i <= 1199; i++) {
                      const testCode = String(i).toUpperCase();
                      const existing = await ChartOfAccountsRepository.findOne(
                        { tenantId: tenantId, accountCode: testCode }
                      );
                      if (!existing) {
                        newCode = testCode;
                        break;
                      }
                    }
                    
                    if (newCode) {
                      // Retry with new code
                      accountData.accountCode = newCode;
                      try {
                        const retryAccount = new ChartOfAccounts(accountData);
                        await retryAccount.save(session ? { session } : {});
                        accountsReceivableAccount = retryAccount;
                        logger.info(`Successfully created Accounts Receivable with code ${newCode} (${accountCode} was taken)`);
                      } catch (retryError) {
                        logger.error('Error creating with new code:', retryError.message);
                        // Continue to throw original error
                      }
                    } else {
                      logger.error('No available code found in 1100-1199 range');
                    }
                  } else {
                    // Account exists but no tenantId or same tenant - use it
                    if (globalAccount.isDeleted) {
                      globalAccount.isDeleted = false;
                      globalAccount.isActive = true;
                      await globalAccount.save();
                    }
                    accountsReceivableAccount = globalAccount;
                    logger.info('Found existing account (no tenantId or same tenant)');
                  }
                }
              }
              
              // If still not found, try finding by name
              if (!accountsReceivableAccount) {
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  {
                    tenantId: tenantId,
                    accountName: { $regex: /^Accounts Receivable$/i },
                    accountType: 'asset',
                    isActive: true,
                    isDeleted: false
                  }
                );
              }
              
              // If we found the account, great! Otherwise, the error will be handled below
              if (accountsReceivableAccount) {
                logger.info('Found existing Accounts Receivable account after duplicate key error');
              } else {
                logger.error(`Account ${accountCode} exists but cannot be found or used for tenant ${tenantId}`);
              }
            } else {
              // For other errors, try upsert as fallback
              logger.info('Trying upsert as fallback:', createError.message);
              const updateOptions = session ? { session } : {};
              const result = await ChartOfAccounts.updateOne(
                { tenantId: tenantId, accountCode: accountCode },
                { $setOnInsert: accountData },
                { upsert: true, ...updateOptions }
              );
              
              // Fetch after upsert (use session if provided)
              accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                { tenantId: tenantId, accountCode: accountCode, isDeleted: false },
                session ? { session } : {}
              );
            }
          }
        } catch (error) {
          logger.error('Error creating/finding Accounts Receivable account:', {
            message: error.message,
            code: error.code,
            name: error.name,
            codeName: error.codeName
          });
          
          // If we're in a transaction and it was aborted, don't try to use the session
          // The transaction will be retried by the retry logic
          if (error.codeName === 'NoSuchTransaction' || error.message?.includes('aborted')) {
            // Transaction was aborted - let it propagate so retry logic can handle it
            throw error;
          }
          
          // Last resort: try to find any active Accounts Receivable account (only if NOT in aborted transaction)
          // If we have a session, the transaction might still be active, so try with session first
          // But if the error suggests the transaction is dead, don't use session
          const useSession = session && !error.message?.includes('aborted');
          accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
            {
              tenantId: tenantId,
              accountName: { $regex: /receivable/i },
              accountType: 'asset',
              isActive: true,
              isDeleted: false
            },
            useSession ? { session } : {}
          );
        }
      }
    }
  }

  // Validate that we have an account
  if (!accountsReceivableAccount || !accountsReceivableAccount._id) {
    // Last resort: try to create a minimal account
    // IMPORTANT: If we're in a transaction that was aborted, don't use the session
    // The retry logic will handle retries
    try {
      logger.info('Last resort: attempting to create Accounts Receivable account');
      const minimalAccountData = {
        accountCode: '1130',
        accountName: 'Accounts Receivable',
        accountType: 'asset',
        accountCategory: 'current_assets',
        normalBalance: 'debit',
        tenantId: tenantId, // CRITICAL: Must include tenantId
        allowDirectPosting: true,
        isActive: true,
        isSystemAccount: true,
        description: 'Money owed by customers - General Accounts Receivable account',
        createdBy: userId || undefined,
        currentBalance: 0,
        openingBalance: 0
      };
      
      // Try to find first (only use session if provided and transaction is still active)
      // If we're in a transaction context, try with session first, but fallback to no session if it fails
      let useSession = !!session;
      
      try {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          { tenantId: tenantId, accountCode: '1130', isDeleted: false },
          useSession ? { session } : {}
        );
      } catch (findError) {
        // If session query fails (transaction aborted), try without session
        if (findError.codeName === 'NoSuchTransaction' || findError.message?.includes('aborted')) {
          logger.warn('Transaction aborted, trying to find account without session');
          useSession = false;
          accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
            { tenantId: tenantId, accountCode: '1130', isDeleted: false }
          );
        } else {
          throw findError;
        }
      }
      
      if (!accountsReceivableAccount) {
        try {
          const newAccount = new ChartOfAccounts(minimalAccountData);
          const saveOptions = useSession ? { session } : {};
          await newAccount.save(saveOptions);
          accountsReceivableAccount = newAccount;
          logger.info('Successfully created Accounts Receivable account as last resort');
        } catch (createError) {
          // Handle duplicate key error - account already exists, fetch it
          if (createError.code === 11000 || createError.codeName === 'DuplicateKey' || 
              createError.message?.includes('duplicate key')) {
            logger.info('Account with code 1130 already exists, fetching existing account');
            try {
              // Try to fetch with session first (with tenantId and isDeleted filter)
              accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                { tenantId: tenantId, accountCode: '1130', isDeleted: false },
                useSession ? { session } : {}
              );
              // If not found with session, try without session
              if (!accountsReceivableAccount) {
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { tenantId: tenantId, accountCode: '1130', isDeleted: false }
                );
              }
              // If still not found, try without isDeleted filter (account might be soft-deleted)
              if (!accountsReceivableAccount) {
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { tenantId: tenantId, accountCode: '1130' }
                );
                // If found but deleted, reactivate it
                if (accountsReceivableAccount && accountsReceivableAccount.isDeleted) {
                  accountsReceivableAccount.isDeleted = false;
                  accountsReceivableAccount.isActive = true;
                  await accountsReceivableAccount.save(useSession ? { session } : {});
                  logger.info('Reactivated deleted Accounts Receivable account');
                }
              }
              // If still not found, try without tenantId filter (might be a shared account)
              if (!accountsReceivableAccount) {
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { accountCode: '1130', isDeleted: false }
                );
                // If found but different tenant, we can't use it - need to create new one
                if (accountsReceivableAccount && accountsReceivableAccount.tenantId !== tenantId) {
                  logger.warn('Found account with code 1130 but different tenantId, cannot use it');
                  accountsReceivableAccount = null;
                }
              }
              if (accountsReceivableAccount) {
                logger.info('Found existing Accounts Receivable account');
              } else {
                // Account exists but we can't find it - might be a different tenant
                // Try to find by name instead, or use a different account code
                logger.warn('Account with code 1130 exists but could not be fetched with tenantId - trying to find by name');
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  {
                    tenantId: tenantId,
                    accountName: { $regex: /^Accounts Receivable$/i },
                    accountType: 'asset',
                    isActive: true,
                    isDeleted: false
                  },
                  useSession ? { session } : {}
                );
                if (!accountsReceivableAccount) {
                  accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                    {
                      tenantId: tenantId,
                      accountName: { $regex: /^Accounts Receivable$/i },
                      accountType: 'asset',
                      isActive: true,
                      isDeleted: false
                    }
                  );
                }
                if (accountsReceivableAccount) {
                  logger.info('Found existing Accounts Receivable account by name');
                }
              }
            } catch (fetchError) {
              logger.error('Error fetching existing account after duplicate key error:', fetchError);
              // Don't throw - continue to try other approaches or let outer catch handle it
            }
            // If we still don't have an account after handling duplicate key, don't throw here
            // Let it continue to the outer catch which will handle it
            if (!accountsReceivableAccount) {
              // Account exists but we can't use it - this is a problem
              // But don't throw duplicate key error, throw a more helpful error
              logger.error('Account with code 1130 exists but cannot be used - may be for different tenant');
            }
          }
          // If save fails with session (transaction aborted), try without session
          else if (useSession && (createError.codeName === 'NoSuchTransaction' || createError.message?.includes('aborted'))) {
            logger.warn('Transaction aborted during save, trying without session');
            try {
              const newAccount = new ChartOfAccounts(minimalAccountData);
              await newAccount.save();
              accountsReceivableAccount = newAccount;
              logger.info('Successfully created Accounts Receivable account without session');
            } catch (retryError) {
              // If retry also fails with duplicate key, fetch existing account
              if (retryError.code === 11000 || retryError.codeName === 'DuplicateKey') {
                logger.info('Account already exists after retry, fetching existing account');
                accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                  { tenantId: tenantId, accountCode: '1130', isDeleted: false }
                );
                if (!accountsReceivableAccount) {
                  throw retryError;
                }
              } else {
                throw retryError;
              }
            }
          } else {
            throw createError;
          }
        }
      }
    } catch (lastResortError) {
      // Check if this is a transaction abort error
      if (lastResortError.codeName === 'NoSuchTransaction' || 
          lastResortError.message?.includes('aborted')) {
        // Transaction was aborted - let it propagate so retry logic can handle it
        throw lastResortError;
      }
      
      // Check if this is a duplicate key error that we've already handled
      if (lastResortError.code === 11000 || lastResortError.codeName === 'DuplicateKey' || 
          lastResortError.message?.includes('duplicate key')) {
        // We've already tried to fetch the account in the inner catch block
        // If we still don't have it, try one more time to find it
        if (!accountsReceivableAccount) {
          logger.warn('Duplicate key error but account not found, trying broader search');
          try {
            // Try to find by name as last resort
            accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
              {
                tenantId: tenantId,
                accountName: { $regex: /receivable/i },
                accountType: 'asset',
                isActive: true,
                isDeleted: false
              }
            );
            if (accountsReceivableAccount) {
              logger.info('Found Accounts Receivable account by name after duplicate key error');
            }
          } catch (findError) {
            logger.error('Error in final attempt to find account:', findError);
          }
        }
        // If we found the account, don't throw - continue
        if (accountsReceivableAccount) {
          logger.info('Account found after handling duplicate key error, continuing');
          // Don't throw - we have the account now
        } else {
          // Account exists but we can't find/use it - this is a configuration issue
          logger.error('Last resort account creation failed - duplicate key but cannot find account:', {
            message: lastResortError.message,
            code: lastResortError.code,
            name: lastResortError.name,
            codeName: lastResortError.codeName
          });
          throw new Error(
            `Failed to find or create Accounts Receivable account. ` +
            `An account with code 1130 already exists but cannot be used for this tenant. ` +
            `Please ensure the chart of accounts is properly configured. ` +
            `Error: ${lastResortError.message}`
          );
        }
      } else {
        logger.error('Last resort account creation failed:', {
          message: lastResortError.message,
          code: lastResortError.code,
          name: lastResortError.name,
          codeName: lastResortError.codeName
        });
        
        // If still failing, throw a more helpful error
        throw new Error(
          `Failed to find or create Accounts Receivable account. ` +
          `Please ensure the chart of accounts is properly configured. ` +
          `Error: ${lastResortError.message}`
        );
      }
    }
    
    // Final validation - but first try one more time to find any Accounts Receivable account
    if (!accountsReceivableAccount || !accountsReceivableAccount._id) {
      // Last attempt: try to find ANY Accounts Receivable account for this tenant
      logger.warn('Accounts Receivable account not found after all attempts, trying final search');
      try {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            tenantId: tenantId,
            accountName: { $regex: /receivable/i },
            accountType: 'asset'
          }
        );
        if (accountsReceivableAccount) {
          // Found it! Reactivate if needed
          if (accountsReceivableAccount.isDeleted) {
            accountsReceivableAccount.isDeleted = false;
            accountsReceivableAccount.isActive = true;
            await accountsReceivableAccount.save();
          }
          logger.info('Found Accounts Receivable account in final search');
        }
      } catch (finalError) {
        logger.error('Final search for Accounts Receivable account failed:', finalError.message);
      }
      
      // Only throw if we still don't have an account
      if (!accountsReceivableAccount || !accountsReceivableAccount._id) {
        throw new Error(
          'Failed to find or create Accounts Receivable account. ' +
          'Please ensure the chart of accounts is properly configured and try again.'
        );
      }
    }
  }

  // If customer has an individual account (like "Customer - NAME"), migrate to general account
  if (customer.ledgerAccount) {
    const existingAccount = await ChartOfAccountsRepository.findOne(
      { _id: customer.ledgerAccount, tenantId: tenantId, isDeleted: false },
      { session }
    );
    if (existingAccount && existingAccount.accountName?.startsWith('Customer -')) {
      // This is an individual customer account - we should migrate to the general account
      // Deactivate the individual account
      await ChartOfAccounts.updateOne(
        { _id: customer.ledgerAccount, tenantId: tenantId },
        {
          $set: {
            isActive: false,
            updatedBy: userId || undefined
          }
        },
        { session }
      );
    }
  }

  // Link customer to the general Accounts Receivable account
  customer.ledgerAccount = accountsReceivableAccount._id;
  const saveOptions = session ? { session, validateBeforeSave: false } : { validateBeforeSave: false };
  await customer.save(saveOptions);
  
  return accountsReceivableAccount;
};

const syncSupplierLedgerAccount = async (supplier, { session, userId } = {}) => {
  if (!supplier) return null;
  
  const tenantId = supplier.tenantId;
  if (!tenantId) {
    throw new Error('Supplier must have tenantId');
  }

  const displayName = supplier.companyName || supplier.contactPerson?.name || 'Unnamed Supplier';
  const accountName = `Supplier - ${displayName}`;

  let account;

  if (!supplier.ledgerAccount) {
    account = await createLedgerAccount({
      prefix: 'AP-SUP-',
      counterKey: 'supplierLedgerAccounts',
      accountName,
      accountType: 'liability',
      accountCategory: 'current_liabilities',
      normalBalance: 'credit',
      tags: ['supplier', supplier._id.toString()],
      status: supplier.status,
      userId,
      tenantId: tenantId,
      session
    });

    supplier.ledgerAccount = account._id;
  } else {
    account = await ChartOfAccountsRepository.findOne(
      { _id: supplier.ledgerAccount, tenantId: tenantId, isDeleted: false },
      { session }
    );
    if (account) {
      account.accountName = accountName;
      account.isActive = isStatusActive(supplier.status);
      account.updatedBy = userId || undefined;
      const existingTags = Array.isArray(account.tags) ? account.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, 'supplier', supplier._id.toString()]));
      if (mergedTags.length !== existingTags.length) {
        account.tags = mergedTags;
      }
      await account.save({ session, validateBeforeSave: false });
    }
  }

  await supplier.save({ session, validateBeforeSave: false });
  return account;
};

const deactivateLedgerAccount = async (accountId, { session, userId, tenantId } = {}) => {
  if (!accountId) return;
  
  // If tenantId provided, use it for security; otherwise fetch account first to get tenantId
  if (tenantId) {
    await ChartOfAccounts.updateOne(
      { _id: accountId, tenantId: tenantId },
      {
        $set: {
          isActive: false,
          updatedBy: userId || undefined
        }
      },
      { session }
    );
  } else {
    // Fallback: find account first to get tenantId (less secure but backward compatible)
    const account = await ChartOfAccountsRepository.findOne(
      { _id: accountId, isDeleted: false },
      { session }
    );
    if (account && account.tenantId) {
      await ChartOfAccounts.updateOne(
        { _id: accountId, tenantId: account.tenantId },
        {
          $set: {
            isActive: false,
            updatedBy: userId || undefined
          }
        },
        { session }
      );
    }
  }
};

const ensureCustomerLedgerAccounts = async ({ userId, tenantId } = {}) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for ensureCustomerLedgerAccounts');
  }
  
  // Find all customers that need ledger accounts or have individual accounts
  const customers = await CustomerRepository.findAll({
    tenantId: tenantId,
    $or: [
      { ledgerAccount: { $exists: false } }, 
      { ledgerAccount: null }
    ]
  });

  // Also find customers with individual accounts to migrate them
  const customersWithIndividualAccounts = await CustomerRepository.findAll(
    {
      ledgerAccount: { $exists: true, $ne: null }
    },
    {
      populate: [{ path: 'ledgerAccount' }]
    }
  );

  // Migrate customers with individual accounts
  for (const customer of customersWithIndividualAccounts) {
    if (customer.ledgerAccount && customer.ledgerAccount.accountName?.startsWith('Customer -')) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await syncCustomerLedgerAccount(customer, { session, userId });
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        logger.error('Failed to migrate ledger account for customer', customer._id, error.message);
      } finally {
        session.endSession();
      }
    }
  }

  // Create ledger accounts for customers without them
  for (const customer of customers) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await syncCustomerLedgerAccount(customer, { session, userId });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create ledger account for customer', customer._id, error.message);
    } finally {
      session.endSession();
    }
  }
};

const ensureSupplierLedgerAccounts = async ({ userId, tenantId } = {}) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for ensureSupplierLedgerAccounts');
  }
  
  const suppliers = await SupplierRepository.findAll({
    tenantId: tenantId,
    $or: [{ ledgerAccount: { $exists: false } }, { ledgerAccount: null }]
  });

  for (const supplier of suppliers) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await syncSupplierLedgerAccount(supplier, { session, userId });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create ledger account for supplier', supplier._id, error.message);
    } finally {
      session.endSession();
    }
  }
};

module.exports = {
  syncCustomerLedgerAccount,
  syncSupplierLedgerAccount,
  deactivateLedgerAccount,
  ensureCustomerLedgerAccounts,
  ensureSupplierLedgerAccounts
};

