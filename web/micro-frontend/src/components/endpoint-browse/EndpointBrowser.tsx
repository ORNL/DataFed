import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import * as util from "../../static/util";
import * as api from "../../static/api";

interface EndpointBrowserProps {
  endpoint: { id: string; name: string };
  path: string;
  mode: 'file' | 'dir';
  onSelect: (path: string) => void;
}

interface TreeNode {
  title: string;
  icon: string | boolean;
  key: string;
  is_dir: boolean;
  size?: string;
  date?: string;
}

const CONFIG = {
  PATH: { SEPARATOR: "/", UP: "..", CURRENT: "." },
  UI: {
    SIZE: { WIDTH: 500, HEIGHT: 400 },
    DELAY: 1000,
    ICONS: {
      FOLDER: "ui-icon ui-icon-folder",
      FILE: "ui-icon ui-icon-file",
    },
  },
};

const EndpointBrowser: React.FC<EndpointBrowserProps> = ({ endpoint, path, mode, onSelect }) => {
  const [currentPath, setCurrentPath] = useState(path);
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  useEffect(() => {
    loadTree();
  }, [currentPath]);

  const loadTree = () => {
    if (loading) return;
    setLoading(true);
    api.epDirList(endpoint.id, currentPath, false, (data) => {
      setTreeData(getTreeSource(data));
      setLoading(false);
    });
  };

  const getTreeSource = (data: any): TreeNode[] => {
    if (data.code) {
      return handleApiError(data);
    }
    return [
      {
        title: CONFIG.PATH.UP,
        icon: CONFIG.UI.ICONS.FOLDER,
        key: CONFIG.PATH.UP,
        is_dir: true,
      },
      ...data.DATA.map((entry: any) =>
        entry.type === "dir"
          ? {
              title: entry.name,
              icon: CONFIG.UI.ICONS.FOLDER,
              key: entry.name,
              is_dir: true,
            }
          : {
              title: entry.name,
              icon: CONFIG.UI.ICONS.FILE,
              key: entry.name,
              is_dir: false,
              size: util.sizeToString(entry.size),
              date: new Date(entry.last_modified.replace(" ", "T")).toLocaleString(),
            },
      ),
    ];
  };

  const handleApiError = (data: any): TreeNode[] => {
    if (data.code === "ConsentRequired") {
      api.getGlobusConsentURL(
        (ok: boolean, consentData: any) => {
          setTreeData([
            {
              title: `Consent Required: Please provide consent.`,
              icon: false,
              key: "consent",
              is_dir: true,
            },
          ]);
          setLoading(false);
        },
        endpoint.id,
        data.required_scopes,
      );
      return [];
    } 
    return [
      {
        title: `Error: ${data.message}`,
        icon: false,
        key: "error",
        is_dir: true,
      },
    ];
  };

  const navigate = (newPath: string) => {
    if (newPath === CONFIG.PATH.UP) {
      const idx = currentPath.lastIndexOf(CONFIG.PATH.SEPARATOR, currentPath.length - 2);
      setCurrentPath(idx > 0 ? currentPath.substring(0, idx + 1) : CONFIG.PATH.SEPARATOR);
    } else {
      setCurrentPath(currentPath + newPath + CONFIG.PATH.SEPARATOR);
    }
  };

  const handleSelect = () => {
    const selectedNode = treeData.find(node => node.key === currentPath);
    if (selectedNode && onSelect) {
      const fullPath = currentPath + 
        (currentPath.endsWith(CONFIG.PATH.SEPARATOR) ? "" : CONFIG.PATH.SEPARATOR) + 
        (selectedNode.key === CONFIG.PATH.CURRENT ? "" : selectedNode.key);
      onSelect(fullPath);
    }
  };

  return (
    <BrowserContainer>
      <PathNavigator>
        <PathLabel>Path:</PathLabel>
        <PathInputContainer>
          <input 
            type="text" 
            value={currentPath} 
            onChange={(e) => setCurrentPath(e.target.value)} 
          />
        </PathInputContainer>
        <button onClick={() => navigate(CONFIG.PATH.UP)}>Up</button>
      </PathNavigator>
      <Spacer />
      <FileTreeView>
        {loading ? (
          <div>Loading...</div>
        ) : (
          treeData.map(node => (
            <TreeRow key={node.key} onClick={() => node.is_dir && navigate(node.key)}>
              <td>
                <span className={node.icon ? String(node.icon) : undefined}></span>
                {node.title}
              </td>
              {!node.is_dir && <td>{node.size}</td>}
              {!node.is_dir && <td>{node.date}</td>}
            </TreeRow>
          ))
        )}
      </FileTreeView>
    </BrowserContainer>
  );
};

const BrowserContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const PathNavigator = styled.div`
  display: flex;
  align-items: center;
`;

const PathLabel = styled.label`
  margin-right: 0.5em;
`;

const PathInputContainer = styled.div`
  flex: auto;
  margin-right: 0.5em;
  
  input {
    width: 100%;
  }
`;

const Spacer = styled.div`
  flex: none;
  padding: 0.25em;
`;

const FileTreeView = styled.div`
  flex: 1 1 100%;
  min-height: 0;
  overflow: auto;
`;

const TreeRow = styled.tr`
  td {
    white-space: nowrap;
    padding: 0 2em 0 0;
  }
`;

export default EndpointBrowser;
