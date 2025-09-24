# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT create a public GitHub issue** for security vulnerabilities
2. Send an email to: [oskari.kosonen@example.com] (replace with your actual email)
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 24 hours
- **Initial Assessment**: We'll provide an initial assessment within 72 hours  
- **Regular Updates**: We'll keep you informed of our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 7 days
- **Disclosure**: After fixing, we'll coordinate public disclosure

### Security Best Practices for Users

When deploying this application:

1. **Environment Variables**: Never commit `.env` files with real credentials
2. **Azure Access**: Use minimal required permissions for Azure Blob Storage
3. **Network Security**: Deploy behind a firewall/VPN for production use
4. **HTTPS**: Always use HTTPS in production
5. **Updates**: Keep dependencies updated regularly
6. **Monitoring**: Monitor logs for suspicious activity

### Known Security Considerations

- This application processes SSH honeypot logs which may contain malicious content
- File uploads are limited to prevent DoS attacks
- Rate limiting is implemented to prevent abuse
- Input validation is performed on all user inputs

### Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for specific origins
- **Input Validation**: All inputs are validated and sanitized
- **Memory Limits**: Prevents memory exhaustion attacks
- **Timeout Handling**: Prevents long-running operations
- **Error Handling**: Prevents information leakage

## Bug Bounty

We currently do not offer a formal bug bounty program, but we greatly appreciate responsible disclosure and will acknowledge security researchers who help improve our security.

Thank you for helping keep our project secure! 🔒
