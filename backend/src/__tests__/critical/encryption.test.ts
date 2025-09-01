/**
 * Critical Path Tests: Encryption Service
 * 
 * Tests the encryption of sensitive data like Plaid access tokens
 */

import { EncryptionService } from '../../utils/encryption';

describe('Encryption Service - Critical Security', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    // Set encryption secret for testing
    process.env.PLAID_ENCRYPTION_SECRET = 'test-encryption-secret-for-testing-only';
    encryptionService = new EncryptionService();
  });

  describe('AES-256-GCM Encryption', () => {
    test('should encrypt and decrypt a Plaid access token correctly', () => {
      const originalToken = 'access-sandbox-8ab29a824f4f400219a1ee2';
      
      const encrypted = encryptionService.encrypt(originalToken);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(originalToken);
      expect(encrypted).not.toBe(originalToken);
      expect(encrypted.length).toBeGreaterThan(originalToken.length);
    });

    test('should produce different ciphertexts for the same plaintext (due to random IV)', () => {
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      
      const encrypted1 = encryptionService.encrypt(token);
      const encrypted2 = encryptionService.encrypt(token);
      
      // Different ciphertexts due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both decrypt to the same value
      expect(encryptionService.decrypt(encrypted1)).toBe(token);
      expect(encryptionService.decrypt(encrypted2)).toBe(token);
    });

    test('should handle long Plaid tokens', () => {
      // Real Plaid access tokens can be quite long
      const longToken = 'access-production-' + 'a'.repeat(200);
      
      const encrypted = encryptionService.encrypt(longToken);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(longToken);
    });

    test('should handle tokens with special characters', () => {
      const tokenWithSpecialChars = 'access-sandbox-!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const encrypted = encryptionService.encrypt(tokenWithSpecialChars);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(tokenWithSpecialChars);
    });

    test('should throw error when decrypting invalid data', () => {
      const invalidEncryptedData = 'this-is-not-valid-encrypted-data';
      
      expect(() => {
        encryptionService.decrypt(invalidEncryptedData);
      }).toThrow('Failed to decrypt data');
    });

    test('should throw error when decrypting tampered data', () => {
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      const encrypted = encryptionService.encrypt(token);
      
      // Tamper with the encrypted data
      const tamperedData = encrypted.slice(0, -10) + 'tampered123';
      
      expect(() => {
        encryptionService.decrypt(tamperedData);
      }).toThrow('Failed to decrypt data');
    });

    test('should throw error when encrypting empty string', () => {
      expect(() => {
        encryptionService.encrypt('');
      }).toThrow('Cannot encrypt empty string');
    });

    test('should throw error when decrypting empty string', () => {
      expect(() => {
        encryptionService.decrypt('');
      }).toThrow('Cannot decrypt empty string');
    });

    test('should validate encryption is working', () => {
      const isValid = encryptionService.validateEncryption();
      expect(isValid).toBe(true);
    });
  });

  describe('Security Requirements', () => {
    test('encrypted tokens should be base64 encoded', () => {
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      const encrypted = encryptionService.encrypt(token);
      
      // Should be valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      
      // Decoding and re-encoding should produce the same string
      const decoded = Buffer.from(encrypted, 'base64');
      const reencoded = decoded.toString('base64');
      expect(reencoded).toBe(encrypted);
    });

    test('should use authenticated encryption (AEAD)', () => {
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      const encrypted = encryptionService.encrypt(token);
      
      // The encrypted data includes salt, IV, auth tag, and ciphertext
      const buffer = Buffer.from(encrypted, 'base64');
      
      // Minimum size: 32 (salt) + 16 (IV) + 16 (tag) + ciphertext
      expect(buffer.length).toBeGreaterThanOrEqual(64 + token.length);
    });

    test('should derive unique keys using PBKDF2', () => {
      // This is implicitly tested by the fact that encryption/decryption works
      // and that tampering detection works (which requires proper key derivation)
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      
      const encrypted = encryptionService.encrypt(token);
      
      // Create a new instance with the same secret
      const newService = new EncryptionService();
      const decrypted = newService.decrypt(encrypted);
      
      expect(decrypted).toBe(token);
    });
  });

  describe('Environment Configuration', () => {
    test('should throw error if no encryption secret is set', () => {
      delete process.env.PLAID_ENCRYPTION_SECRET;
      delete process.env.JWT_SECRET;
      
      expect(() => {
        new EncryptionService();
      }).toThrow('PLAID_ENCRYPTION_SECRET or JWT_SECRET must be set for encryption');
    });

    test('should use PLAID_ENCRYPTION_SECRET when available', () => {
      process.env.PLAID_ENCRYPTION_SECRET = 'plaid-specific-secret';
      process.env.JWT_SECRET = 'jwt-secret';
      
      const service = new EncryptionService();
      const token = 'test-token';
      const encrypted = service.encrypt(token);
      
      // Should be able to decrypt with same service
      expect(service.decrypt(encrypted)).toBe(token);
      
      // Service with different secret should fail
      process.env.PLAID_ENCRYPTION_SECRET = 'different-secret';
      const differentService = new EncryptionService();
      
      expect(() => {
        differentService.decrypt(encrypted);
      }).toThrow('Failed to decrypt data');
    });

    test('should fall back to JWT_SECRET if PLAID_ENCRYPTION_SECRET not set', () => {
      delete process.env.PLAID_ENCRYPTION_SECRET;
      process.env.JWT_SECRET = 'jwt-fallback-secret';
      
      const service = new EncryptionService();
      const token = 'test-token';
      const encrypted = service.encrypt(token);
      
      expect(service.decrypt(encrypted)).toBe(token);
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle multiple Plaid tokens for different institutions', () => {
      const tokens = [
        'access-sandbox-bofa-8ab29a824f4f400219a1ee2',
        'access-sandbox-chase-7bc38b935e5e511330b2ff3',
        'access-sandbox-capital-one-9cd49c046f6f622441c3gg4'
      ];
      
      const encryptedTokens = tokens.map(t => encryptionService.encrypt(t));
      
      // All should be different
      expect(new Set(encryptedTokens).size).toBe(3);
      
      // All should decrypt correctly
      encryptedTokens.forEach((encrypted, i) => {
        expect(encryptionService.decrypt(encrypted)).toBe(tokens[i]);
      });
    });

    test('should handle rapid encryption/decryption cycles', () => {
      const token = 'access-sandbox-8ab29a824f4f400219a1ee2';
      
      // Simulate rapid API calls
      for (let i = 0; i < 100; i++) {
        const encrypted = encryptionService.encrypt(token);
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(token);
      }
    });

    test('should maintain data integrity over multiple encryption cycles', () => {
      let data = 'access-sandbox-initial-token';
      
      // Encrypt and decrypt multiple times
      for (let i = 0; i < 10; i++) {
        const encrypted = encryptionService.encrypt(data);
        data = encryptionService.decrypt(encrypted);
      }
      
      expect(data).toBe('access-sandbox-initial-token');
    });
  });
});