import axios from 'axios';

const URL_PREFIX = 'https://circleci.com/api/v1.1';

// Rough shape, can be refined
export interface ShallowBuild {
  committer_date: string;
  body: string;
  usage_queued_at: string;
  reponame: string;
  build_url: string;
  parallel: number;
  branch: string;
  username: string;
  author_date: string;
  why: string;
  user: {
    is_user: boolean;
    login: string;
    avatar_url: string;
    name: string;
    vcs_type: string;
    id: number;
  };
  vcs_revision: string;
  workflows: {
    job_name: string;
    job_id: string;
    workflow_id: string;
    workspace_id: string;
    upstream_job_ids: string[];
    upstream_concurrency_map: {};
    workflow_name: string;
  };
  vcs_tag: string | null;
  pull_requests: [];
  build_num: number;
  committer_email: string;
  status: string;
  committer_name: string;
  subject: string;
  dont_build: null;
  lifecycle: string;
  fleet: string;
  stop_time: string;
  build_time_millis: number;
  start_time: string;
  platform: string;
  outcome: string;
  vcs_url: string;
  author_name: string;
  queued_at: string;
  author_email: string;
}

export interface Artifact {
  path: string;
  node_index: number;
  url: string;
}

export interface CircleCiOptions {
  vcsType: 'github' | 'bitbucket';
  username: string;
  project: string;
}

export default class CircleCi {
  constructor(private readonly options: CircleCiOptions) {}

  private get optionsUrl() {
    return `${this.options.vcsType}/${this.options.username}/${this.options.project}`;
  }

  async getBuilds(): Promise<ShallowBuild[]> {
    return axios.get(`${URL_PREFIX}/project/${this.optionsUrl}`, {
      params: {
        shallow: true,
        filter: 'completed'
      }
    });
  }

  async getArtifacts(buildNumber: number): Promise<Artifact[]> {
    return axios.get(
      `${URL_PREFIX}/project/${this.optionsUrl}/${buildNumber}/articfacts`
    );
  }
}
