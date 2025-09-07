/**
 * Transaction Matching Service
 * 
 * Handles matching imported transactions with existing transactions
 * to prevent duplicates and provide user confidence in imports
 */

import { StoredTransaction } from './transactionService';
import { ParsedTransaction } from '../utils/csvImport/TransactionCSVParser';

export interface TransactionMatch {
  existingTransaction: StoredTransaction;
  importTransaction: ParsedTransaction;
  confidence: number;
  matchReason: string;
  matchType: 'exact' | 'high' | 'potential' | 'none';
}

export interface MatchingOptions {
  dateWindowDays?: number;
  amountTolerance?: number;
  descriptionSimilarityThreshold?: number;
}

export interface MatchingResult {
  matches: TransactionMatch[];
  totalProcessed: number;
  exactMatches: number;
  highConfidenceMatches: number;
  potentialMatches: number;
  noMatches: number;
}

/**
 * Service for matching imported transactions with existing ones
 * Based on amount, date proximity, and description similarity
 */
export class TransactionMatcher {
  private defaultOptions: Required<MatchingOptions> = {
    dateWindowDays: 3,
    amountTolerance: 0.01,
    descriptionSimilarityThreshold: 0.4
  };

  /**
   * Find matches for a batch of imported transactions
   */
  public findMatches(
    importTransactions: ParsedTransaction[],
    existingTransactions: StoredTransaction[],
    options: MatchingOptions = {}
  ): MatchingResult {
    const opts = { ...this.defaultOptions, ...options };
    const matches: TransactionMatch[] = [];
    
    let exactMatches = 0;
    let highConfidenceMatches = 0;
    let potentialMatches = 0;
    let noMatches = 0;

    for (const importTxn of importTransactions) {
      const txnMatches = this.findMatchesForTransaction(importTxn, existingTransactions, opts);
      
      if (txnMatches.length === 0) {
        noMatches++;
      } else {
        const bestMatch = txnMatches[0]; // Sorted by confidence desc
        matches.push(bestMatch);
        
        if (bestMatch.confidence >= 0.8) {
          exactMatches++;
        } else if (bestMatch.confidence >= opts.descriptionSimilarityThreshold) {
          highConfidenceMatches++;
        } else {
          potentialMatches++;
        }
      }
    }

    return {
      matches,
      totalProcessed: importTransactions.length,
      exactMatches,
      highConfidenceMatches,
      potentialMatches,
      noMatches
    };
  }

  /**
   * Find matches for a single imported transaction
   */
  private findMatchesForTransaction(
    importTxn: ParsedTransaction,
    existingTxns: StoredTransaction[],
    options: Required<MatchingOptions>
  ): TransactionMatch[] {
    const matches: TransactionMatch[] = [];

    for (const existing of existingTxns) {
      // Primary matching: exact amount + date proximity
      if (this.isAmountMatch(importTxn.amount, existing.amount, options.amountTolerance)) {
        const importDate = this.normalizeDate(importTxn.date);
        const existingDate = existing.date;
        
        if (importDate && this.isDateWithinWindow(importDate, existingDate, options.dateWindowDays)) {
          const similarity = this.calculateDescriptionSimilarity(
            importTxn.description, 
            existing.name || existing.userDescription || ''
          );
          
          const matchType = this.determineMatchType(similarity);
          const matchReason = `Amount: ${Math.abs(importTxn.amount)}, Date: ${importDate} vs ${existingDate}`;
          
          matches.push({
            existingTransaction: existing,
            importTransaction: importTxn,
            confidence: similarity,
            matchReason,
            matchType
          });
        }
      }
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if two amounts match within tolerance
   */
  private isAmountMatch(importAmount: number, existingAmount: number, tolerance: number): boolean {
    // Import uses negative for expenses, app uses positive for debits
    // Compare absolute values to handle sign differences
    const importAbs = Math.abs(importAmount);
    const existingAbs = Math.abs(existingAmount);
    return Math.abs(importAbs - existingAbs) <= tolerance;
  }

  /**
   * Check if two dates are within the specified window
   */
  private isDateWithinWindow(date1: string, date2: string, windowDays: number): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d1.getTime() - d2.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= windowDays;
  }

  /**
   * Convert date string to YYYY-MM-DD format
   */
  private normalizeDate(dateStr: string): string | null {
    if (!dateStr) return null;
    
    // Handle M/D/YYYY format from import
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    return null;
  }

  /**
   * Calculate similarity between two description strings
   */
  private calculateDescriptionSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const clean1 = this.cleanDescription(str1);
    const clean2 = this.cleanDescription(str2);
    
    if (clean1 === clean2) return 1.0;
    
    // Check for substring containment
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
      return 0.8;
    }
    
    // Word overlap calculation
    const words1 = new Set(clean1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(clean2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 && words2.size === 0) return 1.0;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Clean description for comparison
   */
  private cleanDescription(description: string): string {
    return description
      .toLowerCase()
      .trim()
      // Remove common transaction ID patterns
      .replace(/\s+id:\w+/g, '')
      .replace(/\s+des:\w+/g, '')
      .replace(/\s+indn:\w+/g, '')
      .replace(/\s+co id:\w+/g, '')
      // Remove masked/X characters
      .replace(/x{2,}/gi, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ');
  }

  /**
   * Determine match type based on confidence score
   */
  private determineMatchType(confidence: number): TransactionMatch['matchType'] {
    if (confidence >= 0.8) return 'exact';
    if (confidence >= 0.4) return 'high';
    if (confidence > 0) return 'potential';
    return 'none';
  }

  /**
   * Group transactions by potential duplicates
   * Useful for preview interfaces
   */
  public groupByDuplicates(
    matches: TransactionMatch[],
    allImportTransactions: ParsedTransaction[]
  ): { duplicates: TransactionMatch[], newTransactions: ParsedTransaction[] } {
    const duplicates = matches.filter(match => 
      match.matchType === 'exact' || match.matchType === 'high'
    );
    
    // Find import transactions that weren't matched with high confidence
    const matchedImportIds = new Set(duplicates.map(d => 
      `${d.importTransaction.date}-${d.importTransaction.description}-${d.importTransaction.amount}`
    ));
    
    // Check ALL import transactions, not just the ones that had matches
    const newTransactions = allImportTransactions.filter(txn => 
      !matchedImportIds.has(`${txn.date}-${txn.description}-${txn.amount}`)
    );
    
    return { duplicates, newTransactions };
  }
}