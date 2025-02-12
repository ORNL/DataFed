import styled from 'styled-components';

export const BrowserContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const PathNavigator = styled.div`
  display: flex;
  align-items: center;
`;

export const PathLabel = styled.label`
  margin-right: 0.5em;
`;

export const PathInputContainer = styled.div`
  flex: auto;
  margin-right: 0.5em;
  
  input {
    width: 100%;
  }
`;

export const Spacer = styled.div`
  flex: none;
  padding: 0.25em;
`;

export const FileTreeView = styled.div`
  flex: 1 1 100%;
  min-height: 0;
  overflow: auto;
  
  tbody {
    width: 100%;
    
    td {
      white-space: nowrap;
      padding: 0 2em 0 0;
    }
  }
`;
