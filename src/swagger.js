const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhistleGuard API',
      version: '1.0.0',
      description: `
## Confidential Reporting System

WhistleGuard is a backend API for anonymous, confidential reporting within organizations.

### Key Features
- **Anonymous Reporting**: Submit reports without creating an account
- **Case Tracking**: Track your report using a secure case code
- **Moderator Dashboard**: Review, filter, and manage reports
- **Privacy First**: No reporter identity is ever stored or exposed

### Authentication
Moderator endpoints require a JWT Bearer token. Obtain one via \`POST /api/moderator/login\`.

### Status Workflow
\`SUBMITTED → UNDER_REVIEW → RESOLVED / DISMISSED → CLOSED\`
      `,
      contact: {
        name: 'WhistleGuard Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from /api/moderator/login',
        },
      },
    },
    tags: [
      {
        name: 'Reports',
        description: 'Public anonymous reporting and case tracking endpoints',
      },
      {
        name: 'Moderator',
        description: 'Authenticated moderator endpoints for managing reports',
      },
      {
        name: 'Admin',
        description: 'Admin-only management endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
