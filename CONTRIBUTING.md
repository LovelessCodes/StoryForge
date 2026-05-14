# Contributing to Story Forge

Thank you for your interest in contributing to Story Forge. This guide will help you get started with the contribution process.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](/CODE_OF_CONDUCT.md) By participating, you are expected to uphold this code.

## Project Structure

The Story Forge repo is organized as follows:

- `/` - Core of Story Forge
- `/src` - React frontend
- `/src-tauri` - Rust backend
- `/public` - Public assets used in the frontend
- `/screenshots` - Screenshots of the application used in the [README.md](/README.md)

## Development Guidelines

When contributing to Story Forge:

- Keep changes focused. Large PRs are harder to review and unlikely to be accepted. We recommend opening an issue and discussing it with us first.
- Ensure all code is type-safe and takes full advantage of TypeScript/Rust features.
- Write clear, self-explanatory code. Use comments only when truly necessary.
- Maintain a consistent and predictable API across all supported frameworks.
- Follow the existing code style and conventions.
- We aim for stability, so avoid changes that would require users to update their config...

## Getting Started

1. Fork the repository to your GitHub account
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/storyforge.git
   cd storyforge
   ```
3. Install [Bun](https://bun.sh/)
4. Install frontend dependencies:
   ```bash
   bun install
   ```
5. Install [Rust](https://rust-lang.org/tools/install/)
6. Run development application:
   ```bash
   bun tauri dev
   ```
7. Build the project:
   ```bash
   bun tauri build
   ```

## Code Formatting with BiomeJS

We use [BiomeJS](https://biomejs.dev/) for code formatting and linting. Before committing, please ensure your code is properly formatted:

```bash
# Format all code and use autofix
bun biome check --write

# Check for linting issues
bun biome check
```

## Development Workflow

1. Create a new branch for your changes:

   ```bash
   git checkout -b type/description
   # Example: git checkout -b feat/new-location
   ```

   Branch type prefixes:
   - `feat/` - New features
   - `fix/` - Bug fixes
   - `refactor/` - Code refactoring
   - `chore/` - Build process or tooling changes

2. Make your changes following the code style guidelines
3. Commit your changes with a descriptive message following this format:
   For changes that need to be included in the changelog (excluding chore changes), use the `fix` or `feat` format with a specific scope:

   ```
   fix(saves): fix incorrect save location

   feat(versions): add support for pre-release candidates
   ```

   For core changes that don't have a specific scope, you can use `fix` and `feat` without a scope:

   ```
   fix: resolve memory leak in saves handling

   feat: add support for server version lookup
   ```

   For changes that refactor or don't change the functionality of the application, use `chore`:

   ```bash
   chore(refactor): reorganize auth module
   chore: update dependencies to latest versions
   ```

   Each commit message should be clear and descriptive, explaining what the change does. For features and fixes, include context about what was added or resolved.

4. Push your branch to your fork
5. Open a pull request against the **release** branch. In your PR description:
   - Clearly describe what changes you made and why
   - Include any relevant context or background
   - List any breaking changes or deprecations
   - Add screenshots for UI changes
   - Reference related issues or discussions

## Pull Request Process

1. Create a draft pull request early to facilitate discussion
2. Reference any related issues in your PR description (e.g., 'Closes #123')
3. Ensure the build is successful
4. Keep your PR focused on a single feature or bug fix
5. Be responsive to code review feedback
6. Update the CHANGELOG.md if your changes are user-facing

## Code Style

- Follow the existing code style
- Use TypeScript types and interfaces effectively
- Keep functions small and focused
- Use meaningful variable and function names
- Add comments for complex logic
- Follow the BiomeJS formatting rules
