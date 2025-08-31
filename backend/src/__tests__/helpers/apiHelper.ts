/**
 * API Helper
 * Utilities for making authenticated API requests in tests
 */

import request from 'supertest';
import app from '../../app';

export interface AuthenticatedUser {
  token: string;
  userId: string;
  username: string;
}

/**
 * Register a new user and return auth token
 */
export async function registerUser(
  username: string,
  password: string
): Promise<AuthenticatedUser> {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, password });
  
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.body.error}`);
  }
  
  return {
    token: response.body.token,
    userId: response.body.user.id,
    username: response.body.user.username,
  };
}

/**
 * Login an existing user and return auth token
 */
export async function loginUser(
  username: string,
  password: string
): Promise<AuthenticatedUser> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });
  
  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.body.error}`);
  }
  
  return {
    token: response.body.token,
    userId: response.body.user.id,
    username: response.body.user.username,
  };
}

/**
 * Make an authenticated GET request
 */
export async function authenticatedGet(
  path: string,
  token: string,
  query?: Record<string, any>
) {
  const req = request(app)
    .get(path)
    .set('Authorization', `Bearer ${token}`);
  
  if (query) {
    req.query(query);
  }
  
  return req;
}

/**
 * Make an authenticated POST request
 */
export async function authenticatedPost(
  path: string,
  token: string,
  body?: any
) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body || {});
}

/**
 * Make an authenticated PUT request
 */
export async function authenticatedPut(
  path: string,
  token: string,
  body?: any
) {
  return request(app)
    .put(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body || {});
}

/**
 * Make an authenticated DELETE request
 */
export async function authenticatedDelete(
  path: string,
  token: string
) {
  return request(app)
    .delete(path)
    .set('Authorization', `Bearer ${token}`);
}

/**
 * Helper to create a test category
 */
export async function createCategory(
  token: string,
  name: string,
  parentId?: string
) {
  const response = await authenticatedPost(
    '/api/v1/categories',
    token,
    {
      name,
      parentId: parentId || null,
      isHidden: false,
      isSavings: false,
    }
  );
  
  return response.body;
}

/**
 * Helper to create a test budget
 */
export async function createBudget(
  token: string,
  categoryId: string,
  month: string,
  amount: number
) {
  const response = await authenticatedPost(
    '/api/v1/budgets',
    token,
    {
      categoryId,
      month,
      amount,
    }
  );
  
  return response.body;
}

/**
 * Helper to sync transactions
 */
export async function syncTransactions(
  token: string,
  startDate?: string
) {
  const response = await authenticatedPost(
    '/api/v1/transactions/sync',
    token,
    { startDate: startDate || '2025-01-01' }
  );
  
  return response.body;
}

/**
 * Helper to get transactions with filters
 */
export async function getTransactions(
  token: string,
  filters?: Record<string, any>
) {
  const response = await authenticatedGet(
    '/api/v1/transactions',
    token,
    filters
  );
  
  return response.body;
}