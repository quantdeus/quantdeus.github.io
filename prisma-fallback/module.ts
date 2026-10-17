import { module } from '@prisma/composer';
import fallbackService from './src/service.ts';

export default module('quantdeus-fallback', ({ provision }) => {
  provision(fallbackService, { id: 'gateway' });
});
