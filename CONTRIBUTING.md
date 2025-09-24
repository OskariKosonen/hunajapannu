# Contributing to Cowrie SSH Honeypot Analytics Dashboard

Thank you for your interest in contributing to this project! This guide will help you get started.

## 🚀 Quick Start for Contributors

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/hunajapannu.git
   cd hunajapannu
   ```
3. **Set up the development environment**:
   ```bash
   make dev-setup
   ```

## 🔧 Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Environment Setup
1. Copy the backend environment template:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Configure your Azure Blob Storage settings in `backend/.env`

### Running the Development Server
```bash
# Start both frontend and backend
make start

# Or individually
npm run start:backend   # Backend only (port 3001)
npm run start:frontend  # Frontend only (port 3000)
```

## 📝 Making Changes

### Branch Naming Convention
- `feature/your-feature-name` - for new features
- `fix/issue-description` - for bug fixes  
- `docs/documentation-update` - for documentation changes
- `refactor/component-name` - for code refactoring

### Commit Messages
We follow the conventional commits specification:
- `feat: add new analytics chart`
- `fix: resolve memory leak in log processing`
- `docs: update installation instructions`
- `style: fix code formatting`
- `refactor: reorganize service layer`
- `test: add unit tests for authentication`

### Code Style
- **Frontend**: TypeScript + React, following React best practices
- **Backend**: Node.js + Express, following Node.js conventions
- **Formatting**: Run `npm run lint` and `npm run format` before committing
- **Comments**: Write clear, concise comments for complex logic

## 🧪 Testing

### Running Tests
```bash
# Run all tests
make test

# Run individual test suites
npm run test:backend
npm run test:frontend
```

### Test Coverage
- Write unit tests for new functions and components
- Ensure integration tests pass for API endpoints
- Test edge cases, especially for log parsing and Azure integration

### Test Files Location
- Backend tests: `backend/src/__tests__/`
- Frontend tests: `frontend/src/__tests__/` or alongside components as `*.test.tsx`

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Information**:
   - OS and version
   - Node.js version
   - Browser (for frontend issues)

2. **Steps to Reproduce**:
   - Clear, numbered steps
   - Expected vs actual behavior
   - Screenshots if applicable

3. **Log Output**:
   - Backend logs from `backend/server.log`
   - Browser console errors
   - Terminal output

4. **Configuration**:
   - Anonymized environment variables
   - Azure setup details (without sensitive info)

## ✨ Feature Requests

When suggesting new features:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: Your idea for implementing the feature
3. **Alternatives**: Other approaches you considered
4. **Screenshots/Mockups**: Visual examples if applicable

### Priority Areas for Contributions
- 📊 **Analytics Features**: New chart types, filtering options
- 🌍 **Geographic Intelligence**: Enhanced location mapping
- 🔒 **Security Features**: Additional protection mechanisms
- 📱 **Mobile Responsiveness**: Better mobile UI/UX
- ⚡ **Performance**: Optimization for large datasets
- 🔧 **DevOps**: Docker support, deployment scripts

## 📋 Pull Request Process

1. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**:
   - Write clean, documented code
   - Add tests for new functionality
   - Update documentation if needed

3. **Test Your Changes**:
   ```bash
   make test
   make build
   ```

4. **Commit Your Changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a pull request on GitHub.

### PR Requirements
- [ ] All tests pass
- [ ] Code builds successfully
- [ ] Documentation updated (if applicable)
- [ ] No merge conflicts
- [ ] Descriptive PR title and description
- [ ] Linked to relevant issues

### PR Review Process
1. **Automated Checks**: CI/CD pipeline runs tests and builds
2. **Code Review**: Maintainers review for quality and standards
3. **Testing**: Manual testing of new features
4. **Approval**: PR approved and merged

## 🏗️ Project Structure

```
hunajapannu/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── routes/         # Express routes
│   │   ├── services/       # Business logic
│   │   └── utils/          # Helper functions
│   └── __tests__/          # Backend tests
├── frontend/               # React TypeScript app
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API clients
│   │   └── __tests__/      # Frontend tests
└── docs/                   # Documentation
```

## 📚 Useful Resources

- [React Documentation](https://reactjs.org/docs)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Azure Blob Storage SDK](https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/)
- [Express.js Guide](https://expressjs.com/en/guide/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 💬 Getting Help

- **Discord/Slack**: [Link if you have one]
- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: [Your contact email]

## 🙏 Recognition

Contributors will be:
- Listed in the README.md
- Tagged in release notes
- Invited to join the maintainers team (for regular contributors)

Thank you for helping make this project better! 🍯🛡️
