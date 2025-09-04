/**
 * Auto-Categorization Service
 * 
 * Manages rules for automatically categorizing transactions based on patterns
 */

import { v4 as uuidv4 } from 'uuid';
import { DataService } from './dataService';
import { StoredTransaction } from './transactionService';
import { AutoCategorizeRule, Category } from '../../../shared/types';
import { categoryService } from './index';

export interface StoredAutoCategorizeRule extends AutoCategorizeRule {
  userId: string;
}

export class AutoCategorizeService {
  constructor(private dataService: DataService) {}

  /**
   * Get all auto-categorization rules for a user
   */
  async getRules(userId: string): Promise<StoredAutoCategorizeRule[]> {
    const rules = await this.dataService.getData<StoredAutoCategorizeRule[]>(
      `autocategorize_rules_${userId}`
    ) || [];
    
    // Sort by priority (lower number = higher priority)
    return rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create a new auto-categorization rule
   */
  async createRule(
    userId: string,
    data: {
      description: string;
      pattern: string;
      categoryId: string;
      categoryName?: string;
      userDescription?: string;
      isActive?: boolean;
    }
  ): Promise<{ success: boolean; rule?: StoredAutoCategorizeRule; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      
      // Check for duplicate pattern
      const duplicate = rules.find(r => 
        r.pattern.toLowerCase() === data.pattern.toLowerCase()
      );
      if (duplicate) {
        return { success: false, error: 'A rule with this pattern already exists' };
      }

      // Assign next priority number (highest + 1)
      const maxPriority = rules.length > 0 
        ? Math.max(...rules.map(r => r.priority))
        : 0;

      const now = new Date().toISOString();
      const newRule: StoredAutoCategorizeRule = {
        id: uuidv4(),
        userId,
        description: data.description,
        pattern: data.pattern,
        matchType: 'contains',
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        userDescription: data.userDescription,
        priority: maxPriority + 1,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };

      rules.push(newRule);
      await this.dataService.saveData(`autocategorize_rules_${userId}`, rules);

      return { success: true, rule: newRule };
    } catch (error) {
      console.error('Error creating auto-categorize rule:', error);
      return { success: false, error: 'Failed to create rule' };
    }
  }

  /**
   * Update an existing rule
   */
  async updateRule(
    userId: string,
    ruleId: string,
    updates: Partial<{
      description: string;
      pattern: string;
      categoryId: string;
      categoryName: string;
      userDescription: string;
      isActive: boolean;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      const rule = rules.find(r => r.id === ruleId);
      
      if (!rule) {
        return { success: false, error: 'Rule not found' };
      }

      // Check for duplicate pattern if pattern is being updated
      if (updates.pattern && updates.pattern !== rule.pattern) {
        const duplicate = rules.find(r => 
          r.id !== ruleId && 
          r.pattern.toLowerCase() === updates.pattern!.toLowerCase()
        );
        if (duplicate) {
          return { success: false, error: 'A rule with this pattern already exists' };
        }
      }

      Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
      await this.dataService.saveData(`autocategorize_rules_${userId}`, rules);

      return { success: true };
    } catch (error) {
      console.error('Error updating auto-categorize rule:', error);
      return { success: false, error: 'Failed to update rule' };
    }
  }

  /**
   * Delete a rule
   */
  async deleteRule(userId: string, ruleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      const filteredRules = rules.filter(r => r.id !== ruleId);
      
      if (filteredRules.length === rules.length) {
        return { success: false, error: 'Rule not found' };
      }

      // Re-number priorities to fill gaps
      filteredRules.forEach((rule, index) => {
        rule.priority = index + 1;
      });

      await this.dataService.saveData(`autocategorize_rules_${userId}`, filteredRules);
      return { success: true };
    } catch (error) {
      console.error('Error deleting auto-categorize rule:', error);
      return { success: false, error: 'Failed to delete rule' };
    }
  }

  /**
   * Reorder rules by updating priorities
   */
  async reorderRules(
    userId: string,
    ruleIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      
      // Validate all rule IDs exist
      const ruleMap = new Map(rules.map(r => [r.id, r]));
      for (const id of ruleIds) {
        if (!ruleMap.has(id)) {
          return { success: false, error: `Rule ${id} not found` };
        }
      }

      // Update priorities based on new order
      ruleIds.forEach((id, index) => {
        const rule = ruleMap.get(id);
        if (rule) {
          rule.priority = index + 1;
          rule.updatedAt = new Date().toISOString();
        }
      });

      await this.dataService.saveData(`autocategorize_rules_${userId}`, rules);
      return { success: true };
    } catch (error) {
      console.error('Error reordering auto-categorize rules:', error);
      return { success: false, error: 'Failed to reorder rules' };
    }
  }

  /**
   * Apply auto-categorization rules to transactions
   * Priority: 1. User rules, 2. Plaid category name matching
   * @param forceRecategorize - If true, will recategorize even already categorized transactions
   */
  async applyRules(
    userId: string,
    transactions: StoredTransaction[],
    userCategories?: Category[],
    forceRecategorize: boolean = false
  ): Promise<{ categorized: number; recategorized: number; errors: string[] }> {
    const rules = await this.getRules(userId);
    const activeRules = rules.filter(r => r.isActive);
    
    // Get user's categories if not provided
    const categories = userCategories || await this.dataService.getCategories(userId);
    
    let categorized = 0;
    let recategorized = 0;
    const errors: string[] = [];

    for (const transaction of transactions) {
      // Check if transaction has a valid category
      const validCategory = transaction.userCategoryId ? 
        categories.find(cat => cat.id === transaction.userCategoryId) : null;
      const hadValidCategory = !!validCategory;
      
      // Skip if already has valid category and we're not force recategorizing
      if (!forceRecategorize && hadValidCategory) {
        continue;
      }
      
      let matched = false;
      const originalCategoryId = transaction.userCategoryId;
      
      // Step 1: Try user-defined rules first
      const description = (transaction.userDescription || transaction.name).toLowerCase();
      for (const rule of activeRules) {
        const pattern = rule.pattern.toLowerCase();
        
        if (rule.matchType === 'contains' && description.includes(pattern)) {
          transaction.categoryId = rule.categoryId;
          transaction.userCategoryId = rule.categoryId;
          // Apply user description if provided by the rule
          if (rule.userDescription) {
            transaction.userDescription = rule.userDescription;
          }
          transaction.updatedAt = new Date();
          
          if (hadValidCategory && originalCategoryId !== rule.categoryId) {
            recategorized++;
          } else if (!hadValidCategory) {
            categorized++;
          }
          
          matched = true;
          break; // Stop after first match
        }
      }
      
      // Step 2: If no user rule matched and transaction has Plaid categories,
      // try to match with user's categories by name
      if (!matched && transaction.category && transaction.category.length > 0) {
        // Get the primary category from Plaid (first element)
        const plaidPrimaryCategory = transaction.category[0]
          ?.replace(/_/g, ' ')  // Convert FOOD_AND_DRINK to Food and Drink
          ?.split(' ')
          ?.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          ?.join(' ');
        
        // Look for a user category with matching name (case-insensitive)
        const matchingCategory = categories.find(cat => 
          cat.name.toLowerCase() === plaidPrimaryCategory?.toLowerCase()
        );
        
        if (matchingCategory) {
          transaction.categoryId = matchingCategory.id;
          transaction.userCategoryId = matchingCategory.id;
          transaction.updatedAt = new Date();
          
          if (hadValidCategory && originalCategoryId !== matchingCategory.id) {
            recategorized++;
          } else if (!hadValidCategory) {
            categorized++;
          }
        }
      }
    }

    return { categorized, recategorized, errors };
  }

  /**
   * Preview what would be categorized without actually applying changes
   */
  async previewCategorization(userId: string, forceRecategorize: boolean = false): Promise<{
    success: boolean;
    wouldCategorize?: number;
    wouldRecategorize?: number;
    total?: number;
    error?: string;
  }> {
    try {
      await categoryService.initializeDefaultCategories(userId);
      
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      const userCategories = await this.dataService.getCategories(userId);
      
      // For preview, include all non-hidden transactions
      const targetTransactions = forceRecategorize 
        ? transactions.filter(t => !t.isHidden)
        : transactions.filter(t => {
            if (t.isHidden) return false;
            if (!t.userCategoryId) return true;
            // Include transactions with invalid category IDs
            const validCategory = userCategories.find(cat => cat.id === t.userCategoryId);
            return !validCategory;
          });
      
      // Make a deep copy to avoid modifying actual data
      const transactionsCopy = targetTransactions.map(t => ({ ...t }));
      
      const result = await this.applyRules(userId, transactionsCopy, userCategories, forceRecategorize);

      return {
        success: true,
        wouldCategorize: result.categorized,
        wouldRecategorize: result.recategorized,
        total: targetTransactions.length,
      };
    } catch (error) {
      console.error('Error previewing categorization:', error);
      return { success: false, error: 'Failed to preview categorization' };
    }
  }

  /**
   * Apply rules to all transactions (with option to force recategorization)
   */
  async applyRulesToAllTransactions(userId: string, forceRecategorize: boolean = false): Promise<{
    success: boolean;
    categorized?: number;
    recategorized?: number;
    total?: number;
    error?: string;
  }> {
    try {
      // Ensure user has default categories initialized
      await categoryService.initializeDefaultCategories(userId);
      
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      // Get user's categories for matching
      const userCategories = await this.dataService.getCategories(userId);

      // Include all non-hidden transactions if force recategorizing
      const targetTransactions = forceRecategorize 
        ? transactions.filter(t => !t.isHidden)
        : transactions.filter(t => {
            if (t.isHidden) return false;
            if (!t.userCategoryId) return true;
            // Include transactions with invalid category IDs
            const validCategory = userCategories.find(cat => cat.id === t.userCategoryId);
            return !validCategory;
          });
      
      const result = await this.applyRules(userId, targetTransactions, userCategories, forceRecategorize);
      
      // Save updated transactions
      await this.dataService.saveData(`transactions_${userId}`, transactions);

      return {
        success: true,
        categorized: result.categorized,
        recategorized: result.recategorized,
        total: targetTransactions.length,
      };
    } catch (error) {
      console.error('Error applying auto-categorization rules:', error);
      return { success: false, error: 'Failed to apply rules' };
    }
  }

  /**
   * Move a rule up in priority (lower number = higher priority)
   */
  async moveRuleUp(userId: string, ruleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      const ruleIndex = rules.findIndex(r => r.id === ruleId);
      
      if (ruleIndex === -1) {
        return { success: false, error: 'Rule not found' };
      }
      
      if (ruleIndex === 0) {
        return { success: false, error: 'Cannot move rule up - already at highest priority' };
      }

      // Swap priorities with previous rule
      const currentRule = rules[ruleIndex];
      const previousRule = rules[ruleIndex - 1];
      
      const tempPriority = currentRule.priority;
      currentRule.priority = previousRule.priority;
      previousRule.priority = tempPriority;
      
      currentRule.updatedAt = new Date().toISOString();
      previousRule.updatedAt = new Date().toISOString();

      await this.dataService.saveData(`autocategorize_rules_${userId}`, rules);
      return { success: true };
    } catch (error) {
      console.error('Error moving rule up:', error);
      return { success: false, error: 'Failed to move rule' };
    }
  }

  /**
   * Move a rule down in priority (higher number = lower priority)
   */
  async moveRuleDown(userId: string, ruleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const rules = await this.getRules(userId);
      const ruleIndex = rules.findIndex(r => r.id === ruleId);
      
      if (ruleIndex === -1) {
        return { success: false, error: 'Rule not found' };
      }
      
      if (ruleIndex === rules.length - 1) {
        return { success: false, error: 'Cannot move rule down - already at lowest priority' };
      }

      // Swap priorities with next rule
      const currentRule = rules[ruleIndex];
      const nextRule = rules[ruleIndex + 1];
      
      const tempPriority = currentRule.priority;
      currentRule.priority = nextRule.priority;
      nextRule.priority = tempPriority;
      
      currentRule.updatedAt = new Date().toISOString();
      nextRule.updatedAt = new Date().toISOString();

      await this.dataService.saveData(`autocategorize_rules_${userId}`, rules);
      return { success: true };
    } catch (error) {
      console.error('Error moving rule down:', error);
      return { success: false, error: 'Failed to move rule' };
    }
  }
}