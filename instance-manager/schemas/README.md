# EDURange CDF Schemas

This directory contains the canonical schema definitions for the Challenge Definition Format (CDF) used across the EDURange-Cloud system. These schemas should be the reference point for all components that interact with the CDF format.

## Schemas

### cdf.schema.json

The main schema for individual challenge definitions. It defines:

- **Metadata**: Required and optional information about a challenge
- **Components**: Different functional parts of a challenge (containers, WebOS apps, questions, etc.)
- **Variables**: Configuration for dynamic content substitution
- **Templates**: Reusable content snippets that can be processed and placed within challenges

### cdf-pack.schema.json

The schema for pack manifest files (`pack.json`). It defines:

- **Required Pack Information**: ID, name, version, and challenge list
- **Optional Metadata**: Description, author, license information
- **Resource References**: Shared resources, prerequisites, and dependencies

## Schema Consistency

All components must use these schemas as the source of truth for validation and type generation. This includes:

- **Instance Manager**: Uses these JSON schema files directly for validation
- **Dashboard (Frontend)**: TypeScript interfaces must be generated or kept in sync with these schemas
- **Database Controller**: Python/SQL schema validation must follow these definitions

## Type Conventions

Key conventions for component types:

- `container`: Docker container components (requires image, optional ports, volumes, env vars)
- `webosApp`: WebOS application components (requires app_type)
- `question`: Question components for assessments (requires question_type and text)
- `configMap`: Configuration data storage (requires data object)
- `secret`: Secret data storage (requires data object)

## Validation Implementation

For each component, validation should ensure:

1. Required fields are present
2. Field types match the schema definitions
3. Enums/constraints are enforced
4. Component-specific validation rules are applied

## Updates

When updating these schemas:

1. Document changes in commits
2. Update corresponding TypeScript types in the dashboard 
3. Update Python schema validation in database controller
4. Ensure backwards compatibility or provide migration path 