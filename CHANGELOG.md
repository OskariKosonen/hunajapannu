# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI/CD pipeline
- Docker support with docker-compose
- Comprehensive documentation and contributing guidelines
- Security policy and issue templates

## [1.0.0] - 2025-09-24

### Added
- Initial release of Cowrie SSH Honeypot Analytics Dashboard
- React TypeScript frontend with Tailwind CSS
- Node.js Express backend with Azure Blob Storage integration
- Real-time analytics processing for honeypot logs
- Geographic intelligence and attack pattern detection
- Brute force detection and login analytics
- Time-based filtering (1h, 24h, 7d, 30d, all-time)
- Memory-efficient streaming for large datasets (10GB+)
- Rate limiting and CORS protection
- Comprehensive Make-based development workflow
- Azure Blob Storage SAS URL authentication
- Responsive design for desktop and mobile

### Features
- **Dashboard Analytics**: Total events, source IP tracking, geographic distribution
- **Login Analytics**: Success/failure rates, credential analysis
- **Attack Patterns**: Brute force detection and tracking
- **API Endpoints**: RESTful API for analytics, logs, and health checks
- **Security**: Rate limiting, input validation, memory limits
- **Development**: Hot reloading, concurrent development servers
- **Deployment**: Production-ready build process

### Technical Stack
- Frontend: React 19.1, TypeScript 4.9, Tailwind CSS 4.1
- Backend: Node.js, Express 4.18, Azure Blob SDK 12.18
- Development: Concurrently, Nodemon, Make
- Security: Helmet, CORS, Express Rate Limit
- Analytics: Moment.js, GeoIP-lite

[Unreleased]: https://github.com/OskariKosonen/hunajapannu/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/OskariKosonen/hunajapannu/releases/tag/v1.0.0
