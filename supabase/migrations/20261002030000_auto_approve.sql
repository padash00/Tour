-- Автоодобрение заявок: заявка с полным составом одобряется сразу, пока есть места
alter table tournaments add column if not exists auto_approve boolean not null default false;
