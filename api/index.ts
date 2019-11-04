import fn from '../src/webhook';
import serverless from '../src/serverless-wrapper';

// Export a proper serverless function for now.sh. This is a separate file
// because we also want the bot to be indepdently exported for local development
export default serverless(fn);
