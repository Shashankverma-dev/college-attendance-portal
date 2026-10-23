import crypto from 'crypto';
import path from 'path';
import { firebaseStorage } from '../config/firebase';

export interface FileValidationResult {
  isValid: boolean;
  detectedMimeType?: string;
  failureReason?: string;
}

/**
 * File Upload and Security Inspection Service (Security §7.2)
 * Enforces 10 MB maximum size limits, magic-byte inspection against MIME-spoofing,
 * randomized UUID filenames, and signed download URLs.
 */
export class UploadService {
  private static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  // Known Magic Byte Signatures
  private static readonly SIGNATURES: { [key: string]: number[] } = {
    pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
    jpeg: [0xff, 0xd8, 0xff],
    png: [0x89, 0x50, 0x4e, 0x47],
    xlsx: [0x50, 0x4b, 0x03, 0x04], // ZIP archive format used by .xlsx
  };

  /**
   * Inspects buffer magic bytes to verify authentic file signatures.
   */
  static inspectMagicBytes(buffer: Buffer, expectedType: 'evidence' | 'bulk_roster' | 'photo'): FileValidationResult {
    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      return { isValid: false, failureReason: 'File size exceeds 10 MB institutional limit.' };
    }

    if (expectedType === 'photo') {
      const isJpeg = this.matchesSignature(buffer, this.SIGNATURES.jpeg);
      const isPng = this.matchesSignature(buffer, this.SIGNATURES.png);
      if (isJpeg) return { isValid: true, detectedMimeType: 'image/jpeg' };
      if (isPng) return { isValid: true, detectedMimeType: 'image/png' };
      return { isValid: false, failureReason: 'Invalid photo signature. Allowed: JPEG, PNG.' };
    }

    if (expectedType === 'evidence') {
      const isPdf = this.matchesSignature(buffer, this.SIGNATURES.pdf);
      const isJpeg = this.matchesSignature(buffer, this.SIGNATURES.jpeg);
      const isPng = this.matchesSignature(buffer, this.SIGNATURES.png);
      if (isPdf) return { isValid: true, detectedMimeType: 'application/pdf' };
      if (isJpeg) return { isValid: true, detectedMimeType: 'image/jpeg' };
      if (isPng) return { isValid: true, detectedMimeType: 'image/png' };
      return { isValid: false, failureReason: 'Invalid evidence document signature. Allowed: PDF, JPEG, PNG.' };
    }

    if (expectedType === 'bulk_roster') {
      const isXlsx = this.matchesSignature(buffer, this.SIGNATURES.xlsx);
      // For CSV, check if ASCII/UTF-8 text
      const isText = this.isUtf8Text(buffer);
      if (isXlsx) return { isValid: true, detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      if (isText) return { isValid: true, detectedMimeType: 'text/csv' };
      return { isValid: false, failureReason: 'Invalid roster format. Allowed: CSV, XLSX.' };
    }

    return { isValid: false, failureReason: 'Unrecognized upload category.' };
  }

  private static matchesSignature(buffer: Buffer, signature: number[]): boolean {
    if (buffer.length < signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }
    return true;
  }

  private static isUtf8Text(buffer: Buffer): boolean {
    // Check first 512 bytes for binary nulls
    const checkLength = Math.min(buffer.length, 512);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) return false; // Null byte indicates binary file
    }
    return true;
  }

  /**
   * Generates a SHA-256 checksum of an uploaded file buffer for integrity verification.
   */
  static computeChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Uploads file to Google Cloud Storage for Firebase and generates a signed download URL.
   */
  static async uploadToStorage(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: 'evidence' | 'photos' | 'imports'
  ): Promise<{ storagePath: string; downloadUrl: string }> {
    const ext = path.extname(originalName).toLowerCase();
    const uniqueFileName = `${folder}/${crypto.randomUUID()}${ext}`;

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'college-attendance-prod.appspot.com';
    const bucket = firebaseStorage.bucket(bucketName);
    const file = bucket.file(uniqueFileName);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Generate authenticated signed URL (valid for 7 days)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return {
      storagePath: uniqueFileName,
      downloadUrl: signedUrl,
    };
  }
}
