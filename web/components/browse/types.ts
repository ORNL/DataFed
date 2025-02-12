export interface TreeNode {
  key: string;
  title: string;
  folder?: boolean;
  lazy?: boolean;
  children?: TreeNode[];
  data?: {
    scope?: string;
    isroot?: boolean;
    nodrag?: boolean;
    offset?: number;
    _title?: string;
    hasBtn?: boolean;
  };
}

export interface TaskItem {
  id: string;
  type: string;
  ct: number; // creation time
  ut: number; // update time
  status: string;
  step?: number;
  steps?: number;
  msg?: string;
}

export interface BrowseTabProps {
  user: {
    uid: string;
    isAdmin: boolean;
    isRepoAdmin: boolean;
  };
  settings: {
    opts: {
      task_hist: number;
      page_sz: number;
    };
    date_opts: Intl.DateTimeFormatOptions;
  };
}
