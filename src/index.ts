import { Application } from 'probot';
import axios from 'axios';
import stream from 'stream';
import archiver from 'archiver';
import Octokit from '@octokit/rest'; // eslint-disable-line import/no-extraneous-dependencies

import CircleCi from './CircleCi';

const WEBSITE_JOB_NAME = 'website';
const NETLIFY_BASE_URL = 'https://api.netlify.com/api/v1';
// TODO: Move these to env
const SITE_ID = '67604fb8-ed9b-48e8-b12a-8298bbd835cb';
const APP_USER = 0;
const GITHUB_REPO = 'nusmodifications/nusmods';
const GITHUB_REPO_PARAMS = {
  owner: 'nusmodifications',
  repo: 'nusmods'
};

const circleCi = new CircleCi({
  vcsType: 'github',
  project: 'nusmodifications',
  username: 'nusmods'
});

/* eslint-disable @typescript-eslint/camelcase */

async function getComment(
  github: Octokit,
  issue: number
): Promise<Octokit.IssuesListCommentsResponseItem | undefined> {
  // Find the comment posted by this bot
  for await (const commentResponse of github.paginate.iterator({
    url: `/repos/${GITHUB_REPO}/issues/${issue}/comments`
  })) {
    const comments = commentResponse.data as Octokit.IssuesListCommentsResponse;
    for (const pullComment of comments) {
      if (pullComment.user.id === APP_USER) {
        return pullComment;
      }
    }
  }

  return undefined;
}

function getCommentBody(commitSha: string, deploymentUrl: string): string {
  return `Deployment preview for \`${commitSha}\` ready at <${deploymentUrl}>`;
}

export = (app: Application) => {
  app.on('check_suite.completed', async context => {
    const { check_suite } = context.payload;
    const { head_sha, pull_requests } = check_suite;

    const builds = await circleCi.getBuilds();

    const checkBuild = builds.find(
      build =>
        build.vcs_revision === head_sha &&
        build.workflows.job_name === WEBSITE_JOB_NAME
    );

    if (checkBuild == null) {
      return;
    }

    const artifacts = await circleCi.getArtifacts(checkBuild.build_num);
    const archive = archiver('zip');

    await Promise.all(
      artifacts.map(({ url, path }) =>
        axios
          .get<unknown, stream.Readable>(url, {
            responseType: 'stream'
          })
          .then(response => archive.append(response, { name: path }))
      )
    );

    const request = axios.post(
      `${NETLIFY_BASE_URL}/${SITE_ID}/deploys`,
      archive,
      {
        headers: {
          'content-type': 'application/zip',
          authorization: ''
        }
      }
    );

    await archive.finalize();
    const response = await request;

    // Get the bot comment on the pull request
    const body = getCommentBody(head_sha, response.data.deploy_url);
    await Promise.all(
      pull_requests.map(async pull => {
        const comment = await getComment(context.github, pull.number);

        if (comment == null) {
          await context.github.issues.createComment({
            ...GITHUB_REPO_PARAMS,
            issue_number: pull.number,
            body
          });
        } else {
          await context.github.issues.updateComment({
            ...GITHUB_REPO_PARAMS,
            comment_id: comment.id,
            body
          });
        }
      })
    );
  });
};
