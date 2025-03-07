import { z } from 'zod';
import { sanitizeString, validateAndSanitize, validationSchemas } from '@/lib/validation';
import { withTestTransaction } from '../../utils/test-helpers';
import { generateTestId } from '../../utils/test-helpers';

describe('Input Validation Utilities', () => {
  describe('sanitizeString function', () => {
    it('should sanitize HTML tags', () => {
      const input = '<script>alert("XSS")</script>';
      const sanitized = sanitizeString(input);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should sanitize quotes and special characters', () => {
      const input = 'User input with "quotes" and \'apostrophes\' and / slashes';
      const sanitized = sanitizeString(input);
      expect(sanitized).not.toContain('"');
      expect(sanitized).not.toContain("'");
      expect(sanitized).not.toContain('/');
      expect(sanitized).toContain('&quot;');
      expect(sanitized).toContain('&#x27;');
      expect(sanitized).toContain('&#x2F;');
    });

    it('should handle empty or null input', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null as unknown as string)).toBe('');
      expect(sanitizeString(undefined as unknown as string)).toBe('');
    });

    it('should sanitize backticks', () => {
      const input = '`template string`';
      const sanitized = sanitizeString(input);
      expect(sanitized).not.toContain('`');
      expect(sanitized).toContain('&#96;');
    });
  });

  describe('validateAndSanitize function', () => {
    it('should validate and sanitize string data', () => {
      const schema = z.string();
      const input = 'Test <script>alert("XSS")</script>';

      const result = validateAndSanitize(schema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toContain('<script>');
        expect(result.data).toContain('&lt;script&gt;');
      }
    });

    it('should validate and sanitize object data', () => {
      const schema = z.object({
        name: z.string(),
        description: z.string(),
      });

      const input = {
        name: 'Test <b>Name</b>',
        description: 'Description with "quotes"',
      };

      const result = validateAndSanitize(schema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).not.toContain('<b>');
        expect(result.data.name).toContain('&lt;b&gt;');
        expect(result.data.description).not.toContain('"');
        expect(result.data.description).toContain('&quot;');
      }
    });

    it('should return validation errors for invalid data', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      const input = {
        email: 'not-an-email',
        age: 16,
      };

      const result = validateAndSanitize(schema, input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('email');
        expect(result.error).toContain('age');
      }
    });

    it('should handle nested objects but not sanitize them recursively', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            bio: z.string(),
          }),
        }),
      });

      const input = {
        user: {
          name: 'Test <script>User</script>',
          profile: {
            bio: 'Bio with <iframe>',
          },
        },
      };

      const result = validateAndSanitize(schema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.name).toContain('<script>');
        expect(result.data.user.profile.bio).toContain('<iframe>');
      }
    });
  });

  describe('Common Validation Schemas', () => {
    describe('Email Validation', () => {
      it('should validate correct email formats', () => {
        const validEmails = [
          'user@example.com',
          'user.name@example.co.uk',
          'user+tag@example.org',
        ];

        validEmails.forEach(email => {
          const result = validationSchemas.email.safeParse(email);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid email formats', () => {
        const invalidEmails = [
          'user@',
          '@example.com',
          'user@.com',
          'user@example.',
          'user@exam ple.com',
          'user@exam\nple.com',
        ];

        invalidEmails.forEach(email => {
          const result = validationSchemas.email.safeParse(email);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('Password Validation', () => {
      it('should validate passwords with sufficient length', () => {
        const validPasswords = [
          'password123',
          'SecureP@ssw0rd',
          '12345678',
        ];

        validPasswords.forEach(password => {
          const result = validationSchemas.password.safeParse(password);
          expect(result.success).toBe(true);
        });
      });

      it('should reject passwords that are too short', () => {
        const invalidPasswords = [
          'pass',
          '1234',
          'short',
        ];

        invalidPasswords.forEach(password => {
          const result = validationSchemas.password.safeParse(password);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('Name Validation', () => {
      it('should validate names with sufficient length', () => {
        const validNames = [
          'John',
          'Jane Doe',
          'Dr. Smith',
        ];

        validNames.forEach(name => {
          const result = validationSchemas.name.safeParse(name);
          expect(result.success).toBe(true);
        });
      });

      it('should reject names that are too short', () => {
        const invalidNames = [
          'J',
          '',
          ' ',
        ];

        invalidNames.forEach(name => {
          const result = validationSchemas.name.safeParse(name);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('URL Validation', () => {
      it('should validate correct URL formats', () => {
        const validUrls = [
          'https://example.com',
          'http://subdomain.example.co.uk/path',
          'https://example.org/path?query=value',
        ];

        validUrls.forEach(url => {
          const result = validationSchemas.url.safeParse(url);
          expect(result.success).toBe(true);
        });
      });

      it('should reject some invalid URL formats', () => {
        const invalidUrls = [
          'http://',
          'not a url at all',
          '://invalid-scheme.com',
        ];

        invalidUrls.forEach(url => {
          const result = validationSchemas.url.safeParse(url);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('ID Validation', () => {
      it('should validate correct UUID formats', () => {
        const validIds = [
          '123e4567-e89b-12d3-a456-426614174000',
          '550e8400-e29b-41d4-a716-446655440000',
        ];

        validIds.forEach(id => {
          const result = validationSchemas.id.safeParse(id);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid UUID formats', () => {
        const invalidIds = [
          '123',
          'not-a-uuid',
          '123e4567-e89b-12d3-a456',
          '123e4567e89b12d3a456426614174000',
        ];

        invalidIds.forEach(id => {
          const result = validationSchemas.id.safeParse(id);
          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe('API Input Validation', () => {
    describe('Competition Schema Validation', () => {
      const competitionSchema = z.object({
        name: validationSchemas.competitionName,
        description: validationSchemas.competitionDescription,
        startDate: z.date(),
        endDate: z.date().optional(),
      });

      it('should validate valid competition data', () => {
        const validData = {
          name: 'Summer CTF 2023',
          description: 'A summer capture the flag competition for cybersecurity students',
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000), // tomorrow
        };

        const result = validateAndSanitize(competitionSchema, validData);
        expect(result.success).toBe(true);
      });

      it('should reject invalid competition data', () => {
        const invalidData = {
          name: 'CT', // too short
          description: 'Short', // too short
          startDate: 'not-a-date', // not a date
        };

        const result = validateAndSanitize(competitionSchema, invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('Challenge Schema Validation', () => {
      const challengeSchema = z.object({
        name: validationSchemas.challengeName,
        description: validationSchemas.challengeDescription,
        type: z.string(),
        difficulty: z.enum(['easy', 'medium', 'hard']),
      });

      it('should validate valid challenge data', () => {
        const validData = {
          name: 'Web Exploitation 101',
          description: 'Learn the basics of web exploitation through practical exercises',
          type: 'web',
          difficulty: 'medium',
        };

        const result = validateAndSanitize(challengeSchema, validData);
        expect(result.success).toBe(true);
      });

      it('should reject invalid challenge data', () => {
        const invalidData = {
          name: 'WE', // too short
          description: 'Short', // too short
          type: 'web',
          difficulty: 'impossible', // not in enum
        };

        const result = validateAndSanitize(challengeSchema, invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('XSS Prevention Tests', () => {
      it('should prevent XSS in form inputs', () => {
        const formSchema = z.object({
          username: z.string(),
          bio: z.string(),
        });

        const maliciousInput = {
          username: '<script>alert("XSS")</script>John',
          bio: '<img src="x" onerror="alert(\'XSS\')">Bio information',
        };

        const result = validateAndSanitize(formSchema, maliciousInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.username).not.toContain('<script>');
          expect(result.data.bio).not.toContain('<img');
          expect(result.data.username).toContain('&lt;script&gt;');
          expect(result.data.bio).toContain('&lt;img');
        }
      });

      it('should sanitize URL parameters but not reject them', () => {
        const urlSchema = z.object({
          redirect: z.string().url(),
          query: z.string(),
        });

        const maliciousInput = {
          redirect: 'https://example.com/path?param=<script>alert("XSS")</script>',
          query: 'search<script>alert("XSS")</script>',
        };

        const result = validateAndSanitize(urlSchema, maliciousInput);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data.query).not.toContain('<script>');
          expect(result.data.query).toContain('&lt;script&gt;');
        }
      });
    });
  });
});

/**
 * Example of using transaction-based testing for input validation
 * This demonstrates how to convert existing tests to use the transaction approach
 */
describe('Transaction-based Input Validation Tests', () => {
  describe('URL Validation with Transactions', () => {
    it('should validate and sanitize URL parameters', async () => {
      await withTestTransaction(async (tx) => {
        // This test doesn't actually need the database, but demonstrates the pattern
        const urlSchema = z.object({
          redirect: z.string().url(),
          query: z.string(),
        });

        const maliciousInput = {
          redirect: 'https://example.com/path?param=<script>alert("XSS")</script>',
          query: 'search<script>alert("XSS")</script>',
        };

        const result = validateAndSanitize(urlSchema, maliciousInput);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data.query).not.toContain('<script>');
          expect(result.data.query).toContain('&lt;script&gt;');
        }
      });
    });

    it('should handle database operations within a transaction', async () => {
      await withTestTransaction(async (tx) => {
        // Create a test record
        const testRecord = await tx.challengeType.create({
          data: {
            id: generateTestId('transaction-validation'),
            name: 'Test Transaction Validation'
          }
        });

        // Verify the record was created
        const foundRecord = await tx.challengeType.findUnique({
          where: { id: testRecord.id }
        });

        expect(foundRecord).toBeDefined();
        expect(foundRecord?.name).toBe('Test Transaction Validation');

        // No need for cleanup - transaction will be rolled back
      });
    });
  });
});
