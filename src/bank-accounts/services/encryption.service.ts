// src/bank-accounts/services/encryption.service.ts

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key = Buffer.from(
    process.env.ENCRYPTION_KEY || 'your-32-character-secret-key!!', // Must be 32 chars
    'utf8'
  );
  private readonly iv = crypto.randomBytes(16);

  /**
   * Encrypt sensitive data (account number)
   */
  encrypt(text: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Store IV with encrypted data (separated by :)
    return this.iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Mask account number (show last 4 digits only)
   */
  maskAccountNumber(accountNumber: string): string {
    const last4 = accountNumber.slice(-4);
    return '**** **** **** ' + last4;
  }

  /**
   * Get last 4 digits
   */
  getLast4Digits(accountNumber: string): string {
    return accountNumber.slice(-4);
  }
}
