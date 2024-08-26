import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  TableCellLayout,
  TableColumnDefinition,
  TableColumnSizingOptions,
  createTableColumn,
  tokens,
} from "@fluentui/react-components";
import { ErrorCircleFilled, MoreHorizontalRegular, WarningFilled } from "@fluentui/react-icons";
import QueryError, { QueryErrorSeverity, compareSeverity } from "Common/QueryError";
import { useQueryTabStyles } from "Explorer/Tabs/QueryTab/Styles";
import { useNotificationConsole } from "hooks/useNotificationConsole";
import React from "react";

const severityIcons = {
  [QueryErrorSeverity.Error]: <ErrorCircleFilled color={tokens.colorPaletteRedBackground3} />,
  [QueryErrorSeverity.Warning]: <WarningFilled color={tokens.colorPaletteYellowForeground1} />,
};

export const ErrorList: React.FC<{ errors: QueryError[] }> = ({ errors }) => {
  const styles = useQueryTabStyles();
  const onErrorDetailsClick = (): boolean => {
    useNotificationConsole.getState().expandConsole();
    return false;
  };

  const columns: TableColumnDefinition<QueryError>[] = [
    createTableColumn<QueryError>({
      columnId: "code",
      compare: (item1, item2) => item1.code.localeCompare(item2.code),
      renderHeaderCell: () => null,
      renderCell: (item) => item.code,
    }),
    createTableColumn<QueryError>({
      columnId: "severity",
      compare: (item1, item2) => compareSeverity(item1.severity, item2.severity),
      renderHeaderCell: () => null,
      renderCell: (item) => <TableCellLayout media={severityIcons[item.severity]}>{item.severity}</TableCellLayout>,
    }),
    createTableColumn<QueryError>({
      columnId: "location",
      compare: (item1, item2) => item1.location?.start?.offset - item2.location?.start?.offset,
      renderHeaderCell: () => "Location",
      renderCell: (item) =>
        item.location
          ? item.location.start.lineNumber
            ? `Line ${item.location.start.lineNumber}`
            : "<unknown>"
          : "<no location>",
    }),
    createTableColumn<QueryError>({
      columnId: "message",
      compare: (item1, item2) => item1.message.localeCompare(item2.message),
      renderHeaderCell: () => "Message",
      renderCell: (item) => (
        <div className={styles.errorListMessageCell}>
          <div className={styles.errorListMessage}>{item.message}</div>
          <div>
            <Button
              aria-label="Details"
              appearance="subtle"
              icon={<MoreHorizontalRegular />}
              onClick={onErrorDetailsClick}
            />
          </div>
        </div>
      ),
    }),
  ];

  const columnSizingOptions: TableColumnSizingOptions = {
    code: {
      minWidth: 75,
      idealWidth: 75,
      defaultWidth: 75,
    },
    severity: {
      minWidth: 100,
      idealWidth: 100,
      defaultWidth: 100,
    },
    location: {
      minWidth: 100,
      idealWidth: 100,
      defaultWidth: 100,
    },
    message: {
      minWidth: 500,
    },
  };

  return (
    <DataGrid
      data-test="QueryTab/ResultsPane/ErrorList"
      items={errors}
      columns={columns}
      sortable
      resizableColumns
      columnSizingOptions={columnSizingOptions}
      focusMode="composite"
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<QueryError>>
        {({ item, rowId }) => (
          <DataGridRow<QueryError> key={rowId} data-test={`Row:${rowId}`}>
            {({ columnId, renderCell }) => (
              <DataGridCell data-test={`Row:${rowId}/Column:${columnId}`}>{renderCell(item)}</DataGridCell>
            )}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  );
};