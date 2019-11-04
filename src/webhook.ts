import { Application } from 'probot';
import axios from 'axios';
import stream from 'stream';
import archiver from 'archiver';
import { asyncFind, asyncFlatMap } from 'iter-tools';

// Type imports, not declared because we don't want to diverge from the versions used by Probot
import Octokit from '@octokit/rest'; // eslint-disable-line import/no-extraneous-dependencies
import { WebhookPayloadCheckSuiteCheckSuite } from '@octokit/webhooks'; // eslint-disable-line import/no-extraneous-dependencies

import CircleCi from './CircleCi';

const WEBSITE_JOB_NAME = 'website';
const NETLIFY_BASE_URL = 'https://api.netlify.com/api/v1';

const SITE_ID = process.env.NETLIFY_SITE_ID!;
const APP_USER = Number(process.env.BOT_USER_ID!);

const GITHUB_REPO = 'nusmodifications/nusmods';
const GITHUB_REPO_PARAMS = {
  owner: 'nusmodifications',
  repo: 'nusmods',
};

const circleCi = new CircleCi({
  vcsType: 'github',
  username: 'nusmodifications',
  project: 'nusmods',
});

/* eslint-disable @typescript-eslint/camelcase */

async function getComment(
  github: Octokit,
  issue: number,
): Promise<Octokit.IssuesListCommentsResponseItem | undefined> {
  // Find the comment posted by this bot
  const comments = asyncFlatMap(
    (response: Octokit.Response<Octokit.IssuesListCommentsResponse>) =>
      response.data,
    github.paginate.iterator({
      url: `/repos/${GITHUB_REPO}/issues/${issue}/comments`,
    }),
  );

  return asyncFind(comment => comment.user.id === APP_USER, comments);
}

function getCommentBody(
  pull: number,
  commitSha: string,
  deploymentUrl: string,
): string {
  const url = `https://github.com/${GITHUB_REPO}/pull/${pull}/commits/${commitSha}`;
  return `Deployment preview for [\`${commitSha.slice(
    0,
    8,
  )}\`](${url}) ready at <${deploymentUrl}>`;
}

function isCircleCiBuild(check: WebhookPayloadCheckSuiteCheckSuite): boolean {
  return Boolean(check.app.name.match(/circleci/i));
}

// export = ApplicationFn compiles into Probot compatible JS export
export = (app: Application) => {
  axios.interceptors.request.use(config => {
    // Log all outgoing axios requests
    app.log.trace('Making request', { url: config.url });
    return config;
  });

  app.on('check_suite.completed', async context => {
    const { check_suite } = context.payload;

    if (!isCircleCiBuild(check_suite) || check_suite.conclusion !== 'success') {
      context.log.debug('Check is not a successful CircleCI build - skipping');
      return;
    }

    // For some reason GitHub doesn't include pull requests in success check webhook payloads, so we need
    // to go and look for it in all check runs
    let pulls = check_suite.pull_requests.map(pull => pull.number);
    if (pulls.length === 0) {
      const checkRuns = asyncFlatMap(
        (response: Octokit.Response<Octokit.ChecksListForRefResponse>) =>
          response.data.check_runs,
        context.github.paginate.iterator({
          url: `/repos/${GITHUB_REPO}/commits/${check_suite.head_branch}/check-suites`,
          headers: {
            accept: 'application/vnd.github.antiope-preview+json',
          },
        }),
      );

      const checkSuite = await asyncFind(
        check => check.pull_requests.length > 0,
        checkRuns,
      );

      if (checkSuite != null) {
        pulls = check_suite.pull_requests.map(pull => pull.number);
      }
    }

    // Only continue if there's a pull request we can comment on
    if (pulls.length === 0) {
      context.log.warn('Pull request cannot be found for check suite', {
        check_suite,
      });
      return;
    }

    context.log.trace('Getting builds from CircleCI');
    const builds = await circleCi.getBuilds();

    const checkBuild = builds.find(
      build =>
        build.vcs_revision === check_suite.head_sha &&
        build.workflows.job_name === WEBSITE_JOB_NAME,
    );

    if (checkBuild == null) {
      context.log.warn('Could not find matching CircleCI build');
      return;
    }

    const artifacts = await circleCi.getArtifacts(checkBuild.build_num);
    context.log.debug('Found CircleCI artifacts', { artifacts });

    // Deploy artifacts from CircleCI by uploading a zip archive
    // https://docs.netlify.com/api/get-started/#zip-file-method
    // We're not using Netlify's OpenAPI wrapper because the wrapper
    // doesn't seem to support this
    const archive = archiver('zip');
    const request = axios.post(
      `${NETLIFY_BASE_URL}/sites/${SITE_ID}/deploys`,
      archive,
      {
        headers: {
          'content-type': 'application/zip',
          authorization: `Bearer ${process.env.NETLIFY_TOKEN}`,
        },
      },
    );

    await Promise.all(
      artifacts.map(({ url, path }) =>
        axios
          .get<stream.Readable>(url, {
            responseType: 'stream',
          })
          .then(response => {
            context.log.trace('Appending file to archive', { path });
            archive.append(response.data, { name: path });
          }),
      ),
    );

    context.log.trace('Finalizing archive');
    archive.finalize();

    context.log.trace('Making Netlify request');
    const response = await request;
    context.log.debug('Got response from Netlify', { data: response.data });

    // Get the bot comment on the pull request
    await Promise.all(
      pulls.map(async issue => {
        const body = getCommentBody(
          issue,
          check_suite.head_sha,
          response.data.deploy_url,
        );
        const comment = await getComment(context.github, issue);

        if (comment == null) {
          context.log.debug('No existing comment - creating');
          await context.github.issues.createComment({
            ...GITHUB_REPO_PARAMS,
            issue_number: issue,
            body,
          });
        } else {
          context.log.debug('Updating existing comment');
          await context.github.issues.updateComment({
            ...GITHUB_REPO_PARAMS,
            comment_id: comment.id,
            body,
          });
        }
      }),
    );
  });
};
