import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import * as util from '../../util';
import * as model from '../../model';

interface ItemDetailsProps {
  item: any; // TODO: Add proper type
}

export const ItemDetails: React.FC<ItemDetailsProps> = ({ item }) => {
  const renderField = (label: string, value: any) => {
    if (!value) return null;
    return (
      <Grid container spacing={1}>
        <Grid item xs={4}>
          <Typography color="textSecondary">{label}:</Typography>
        </Grid>
        <Grid item xs={8}>
          <Typography>{value}</Typography>
        </Grid>
      </Grid>
    );
  };

  return (
    <Box p={2}>
      {renderField('ID', item.id)}
      {renderField('Type', item.type)}
      {item.alias && renderField('Alias', item.alias)}
      {item.tags && renderField('Tags', item.tags.join(', '))}
      {item.owner && renderField('Owner', item.owner)}
      {item.creator && renderField('Creator', item.creator)}
      
      {item.id.startsWith('d/') && (
        <>
          {renderField('Location', item.external ? 'External' : item.repoId.substr(5))}
          {renderField('Size', item.external ? 'Unknown' : util.sizeToString(item.size))}
          {item.source && renderField('Source', item.source)}
        </>
      )}

      {/* Add other type-specific fields */}
    </Box>
  );
};
