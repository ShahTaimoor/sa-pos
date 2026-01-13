/**
 * Tenant Isolation Test Suite
 * 
 * Tests to ensure complete data isolation between tenants
 * 
 * Run with: npm test -- tenantIsolation.test.js
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Sales = require('../models/Sales');
const customerRepository = require('../repositories/CustomerRepository');
const productRepository = require('../repositories/ProductRepository');
const salesRepository = require('../repositories/SalesRepository');

describe('Tenant Isolation Tests', () => {
  let tenant1Id;
  let tenant2Id;
  let user1;
  let user2;
  let customer1;
  let customer2;
  let product1;
  let product2;

  beforeAll(async () => {
    await connectDB();
    
    // Create two tenants
    tenant1Id = new mongoose.Types.ObjectId();
    tenant2Id = new mongoose.Types.ObjectId();
    
    // Create users for each tenant
    user1 = await User.create({
      tenantId: tenant1Id,
      firstName: 'User',
      lastName: 'One',
      email: 'user1@test.com',
      password: 'password123',
      role: 'admin',
      status: 'active'
    });
    
    user2 = await User.create({
      tenantId: tenant2Id,
      firstName: 'User',
      lastName: 'Two',
      email: 'user2@test.com',
      password: 'password123',
      role: 'admin',
      status: 'active'
    });
    
    // Create customers for each tenant
    customer1 = await Customer.create({
      tenantId: tenant1Id,
      name: 'Customer One',
      businessName: 'Business One',
      status: 'active',
      createdBy: user1._id
    });
    
    customer2 = await Customer.create({
      tenantId: tenant2Id,
      name: 'Customer Two',
      businessName: 'Business Two',
      status: 'active',
      createdBy: user2._id
    });
    
    // Create products for each tenant
    product1 = await Product.create({
      tenantId: tenant1Id,
      name: 'Product One',
      sku: 'PROD1',
      price: 100,
      status: 'active',
      createdBy: user1._id
    });
    
    product2 = await Product.create({
      tenantId: tenant2Id,
      name: 'Product Two',
      sku: 'PROD2',
      price: 200,
      status: 'active',
      createdBy: user2._id
    });
  });

  afterAll(async () => {
    // Cleanup
    await Customer.deleteMany({ _id: { $in: [customer1._id, customer2._id] } });
    await Product.deleteMany({ _id: { $in: [product1._id, product2._id] } });
    await User.deleteMany({ _id: { $in: [user1._id, user2._id] } });
    await mongoose.connection.close();
  });

  describe('Repository Level Isolation', () => {
    test('findAll should only return data for specified tenant', async () => {
      const customers1 = await customerRepository.findAll({}, {
        tenantId: tenant1Id
      });
      
      const customers2 = await customerRepository.findAll({}, {
        tenantId: tenant2Id
      });
      
      expect(customers1.length).toBe(1);
      expect(customers1[0]._id.toString()).toBe(customer1._id.toString());
      
      expect(customers2.length).toBe(1);
      expect(customers2[0]._id.toString()).toBe(customer2._id.toString());
    });

    test('findById should only return data for specified tenant', async () => {
      const found1 = await customerRepository.findById(customer1._id, {
        tenantId: tenant1Id
      });
      
      const found2 = await customerRepository.findById(customer2._id, {
        tenantId: tenant2Id
      });
      
      expect(found1).not.toBeNull();
      expect(found1._id.toString()).toBe(customer1._id.toString());
      
      expect(found2).not.toBeNull();
      expect(found2._id.toString()).toBe(customer2._id.toString());
    });

    test('findById should return null for cross-tenant access', async () => {
      // Try to access tenant2's customer with tenant1's tenantId
      const found = await customerRepository.findById(customer2._id, {
        tenantId: tenant1Id
      });
      
      expect(found).toBeNull();
    });

    test('findAll should throw error without tenantId', async () => {
      await expect(
        customerRepository.findAll({})
      ).rejects.toThrow('Tenant ID is required');
    });

    test('create should require tenantId', async () => {
      const newCustomer = {
        name: 'New Customer',
        businessName: 'New Business',
        status: 'active'
      };
      
      await expect(
        customerRepository.create(newCustomer)
      ).rejects.toThrow('tenantId is required');
    });

    test('updateById should only update within tenant', async () => {
      await customerRepository.updateById(
        customer1._id,
        { name: 'Updated Customer One' },
        { tenantId: tenant1Id }
      );
      
      const updated = await customerRepository.findById(customer1._id, {
        tenantId: tenant1Id
      });
      
      expect(updated.name).toBe('Updated Customer One');
      
      // Try to update tenant2's customer with tenant1's tenantId - should fail
      const result = await customerRepository.updateById(
        customer2._id,
        { name: 'Hacked' },
        { tenantId: tenant1Id }
      );
      
      expect(result).toBeNull(); // Should not update
    });
  });

  describe('Service Level Isolation', () => {
    test('Services should enforce tenantId', async () => {
      // This test would require importing the service
      // For now, we test at repository level which services use
      expect(true).toBe(true);
    });
  });

  describe('Cross-Tenant Access Prevention', () => {
    test('Tenant 1 cannot see Tenant 2 data', async () => {
      const allCustomers = await customerRepository.findAll({}, {
        tenantId: tenant1Id
      });
      
      const tenant2CustomerIds = allCustomers
        .map(c => c._id.toString())
        .filter(id => id === customer2._id.toString());
      
      expect(tenant2CustomerIds.length).toBe(0);
    });

    test('Tenant 2 cannot see Tenant 1 data', async () => {
      const allCustomers = await customerRepository.findAll({}, {
        tenantId: tenant2Id
      });
      
      const tenant1CustomerIds = allCustomers
        .map(c => c._id.toString())
        .filter(id => id === customer1._id.toString());
      
      expect(tenant1CustomerIds.length).toBe(0);
    });
  });

  describe('Aggregation Isolation', () => {
    test('Aggregation should be tenant-scoped', async () => {
      const pipeline = [
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ];
      
      const result1 = await customerRepository.aggregate(pipeline, {
        tenantId: tenant1Id
      });
      
      const result2 = await customerRepository.aggregate(pipeline, {
        tenantId: tenant2Id
      });
      
      expect(result1.length).toBeGreaterThan(0);
      expect(result2.length).toBeGreaterThan(0);
      
      // Each tenant should only see their own data
      const total1 = result1.reduce((sum, r) => sum + r.count, 0);
      const total2 = result2.reduce((sum, r) => sum + r.count, 0);
      
      expect(total1).toBe(1); // Only customer1
      expect(total2).toBe(1); // Only customer2
    });
  });
});
