# frontify-finder

Search and access Frontify assets data from any secure web app.

# Install

Installing the latest published package on a 3rd party app is as simple as running `npm i @frontify/frontify-finder` and requiring the main class either via CommonJs or as an ES module.

```
// CommonJs require
const FrontifyFinder = require('@frontify/frontify-finder');
```

OR

```
// ESM import
import FrontifyFinder from '@frontify/frontify-finder';
```

There is a require/import example prepared on `src/local.ts` for added convienience simulating an end user import. To try it out, you simply need to run the `npm run local` command on the package root location.

# Build

To perform a new build simply run `npm run build` in the application root folder. This will regenerate the `dist` folder contents with the production ready typescript compiled files.
