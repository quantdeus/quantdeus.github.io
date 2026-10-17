import node from '@prisma/composer/node';
import { compute } from '@prisma/composer-prisma-cloud';

export default compute({
  name: 'quantdeus-fallback',
  deps: {},
  build: node({
    module: import.meta.url,
    entry: '../dist/server.mjs',
  }),
});
