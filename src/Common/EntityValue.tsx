import { DatePicker, TextField } from "office-ui-fabric-react";
import React, { FunctionComponent } from "react";

export interface TableEntityProps {
  entityValueLabel?: string;
  entityValuePlaceholder: string;
  entityValue: string | Date;
  isEntityTypeDate: boolean;
  entityTimeValue: string;
  entityValueType: string;
  onEntityValueChange: (event: React.FormEvent<HTMLElement>, newInput?: string) => void;
  onSelectDate: (date: Date | null | undefined) => void;
  onEntityTimeValueChange: (event: React.FormEvent<HTMLElement>, newInput?: string) => void;
}

export const EntityValue: FunctionComponent<TableEntityProps> = ({
  entityValueLabel,
  entityValuePlaceholder,
  entityValue,
  isEntityTypeDate,
  entityTimeValue,
  entityValueType,
  onEntityValueChange,
  onSelectDate,
  onEntityTimeValueChange,
}: TableEntityProps): JSX.Element => {
  if (isEntityTypeDate) {
    return (
      <>
        <DatePicker
          className="addEntityDatePicker"
          placeholder={entityValuePlaceholder}
          value={entityValue && new Date(entityValue)}
          ariaLabel={entityValuePlaceholder}
          onSelectDate={onSelectDate}
        />
        <TextField
          label={entityValueLabel && entityValueLabel}
          id="entityTimeId"
          autoFocus
          type="time"
          value={entityTimeValue}
          onChange={onEntityTimeValueChange}
        />
      </>
    );
  }

  return (
    <TextField
      label={entityValueLabel && entityValueLabel}
      className="addEntityTextField"
      id="entityValueId"
      autoFocus
      type={entityValueType}
      placeholder={entityValuePlaceholder}
      value={typeof entityValue === "string" && entityValue}
      onChange={onEntityValueChange}
    />
  );
};