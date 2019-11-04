# NUSMods Deploy Previw Bot

Automatically deploys built artifacts from successful CircleCI deploys to Netlify using a GitHub webhook, then link the deploy to the pull request on GitHub. Currently deployed as a serverless function on now.sh - https://circleci.com/docs/api/#recent-builds-for-a-single-project

Built with ProBot: https://probot.github.io/docs/development/ 

API documentations

- Netlify: https://docs.netlify.com/api/get-started/#zip-file-method
- OctoKit: https://octokit.github.io/rest.js/#octokit-routes-issues
- CircleCI: https://circleci.com/docs/api/#recent-builds-for-a-single-project

## Development and Testing

To test the function locally, use the following commands

```sh
# Compile TypeScript
yarn watch

# Lint code
yarn lint

# Run Probot locally using the given fixture as the webhook event
yarn probot receive -e check_suite.completed -p ./fixture/check_suite.completed.json ./lib/src/webhook.js 
```

## Deployment

Deploy using the `now` command

```sh
# Install now CLI
yarn global add now

# Deploy to personal now.sh instance
now
```

This deploys the `/api` folder as a serverless function. Since now.sh supports TypeScript natively, we don't need a build script. The webhook will be accessible at `<now.sh URL>/api`. 

## Secrets

To add a sensitive env variable, use `now secret` to add the secret to now.sh, then map the variable to an env variable in Node in the `now.json` config file. You also need to add the same env variable to `.env` and `.env.example` since we do not load secrets from now.sh in development. 
