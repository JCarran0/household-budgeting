import crypto from 'crypto';

/**
 * Encryption utility for sensitive data using AES-256-GCM
 * This provides authenticated encryption with associated data (AEAD)
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  private readonly iterations = 100000; // PBKDF2 iterations
  private encryptionKey: Buffer;

  constructor() {
    const secret = process.env.PLAID_ENCRYPTION_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('PLAID_ENCRYPTION_SECRET or JWT_SECRET must be set for encryption');
    }
    
    // Derive a key from the secret using PBKDF2
    const salt = crypto.createHash('sha256').update('plaid-token-salt').digest();
    this.encryptionKey = crypto.pbkdf2Sync(secret, salt, this.iterations, this.keyLength, 'sha256');
  }

  /**
   * Encrypts a string using AES-256-GCM
   * @param plaintext The string to encrypt
   * @returns Base64 encoded encrypted string with format: salt.iv.tag.ciphertext
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty string');
    }

    try {
      // Generate random salt and IV for this encryption
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive a unique key for this encryption using the salt
      const key = crypto.pbkdf2Sync(
        this.encryptionKey,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt the plaintext
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt, iv, tag, and encrypted data
      const combined = Buffer.concat([salt, iv, tag, encrypted]);

      // Return base64 encoded string
      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts a string encrypted with encrypt()
   * @param encryptedData Base64 encoded encrypted string
   * @returns The decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      throw new Error('Cannot decrypt empty string');
    }

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);

      // Derive the key using the salt
      const key = crypto.pbkdf2Sync(
        this.encryptionKey,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data - token may be corrupted or tampered with');
    }
  }

  /**
   * Validates that encryption/decryption is working correctly
   * @returns true if encryption is working
   */
  validateEncryption(): boolean {
    try {
      const testData = 'test-plaid-token-' + Date.now();
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      return decrypted === testData;
    } catch (error) {
      console.error('Encryption validation failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();