import React from 'react';
import { TextField, TextFieldProps } from './TextField';

export type LedgerInputProps = Omit<TextFieldProps, 'keyboardType'> & { keyboardType?: TextFieldProps['keyboardType'] };

/** Campo monetário/numérico: o campo único `TextField` com teclado numérico e placeholder 0,00 por padrão. */
export const LedgerInput: React.FC<LedgerInputProps> = ({ keyboardType = 'numeric', placeholder = '0,00', ...props }) => (
  <TextField keyboardType={keyboardType} placeholder={placeholder} {...props} />
);

export default LedgerInput;
