select
  max(id) as max_invoice_line_id,
  pg_get_serial_sequence('public.invoice_lines', 'id') as sequence_name,
  nextval(pg_get_serial_sequence('public.invoice_lines', 'id')) as next_sequence_value
from public.invoice_lines;

