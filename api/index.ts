import fn from '../src/webhook';
import { serverless } from '../src/serverless-wrapper';

export default serverless(fn);
