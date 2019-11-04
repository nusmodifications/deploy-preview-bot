import { findPrivateKey } from 'probot/lib/private-key';
import { ApplicationFunction, createProbot, Options } from 'probot';

const defaultOptions = {
  id: Number(process.env.APP_ID!),
  secret: process.env.WEBHOOK_SECRET,
  cert: findPrivateKey()!,
  webhookPath: '/api',
};

// Wraps Probot apps so that the export is compatible with now.sh serverless functions
// eslint-disable-next-line import/prefer-default-export
export const serverless = (
  apps: ApplicationFunction | ApplicationFunction[],
  options: Partial<Options> = {},
) => {
  const mergedOptions = { ...defaultOptions, ...options };
  const probot = createProbot(mergedOptions);
  const appArray = Array.isArray(apps) ? apps : [apps];
  appArray.forEach(a => probot.load(a));
  return probot.server;
};
