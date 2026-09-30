"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FilterBarProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  statusValue: string;
  onStatusChange: (status: string) => void;
}

export function FilterBar({ filterValue, onFilterChange, statusValue, onStatusChange }: FilterBarProps) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
      <div><label htmlFor="user-search" className="mb-2 block text-sm font-medium">Buscar usuários</label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="user-search" type="search" value={filterValue} onChange={(event) => onFilterChange(event.target.value)} placeholder="Nome ou email" className="pl-10" /></div></div>
      <div><label htmlFor="user-role-filter" className="mb-2 block text-sm font-medium">Permissão</label><select id="user-role-filter" value={statusValue} onChange={(event) => onStatusChange(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">Todas as permissões</option><option value="ADMIN">Administradores</option><option value="PROMOTER">Promotores</option><option value="BASIC">Usuários</option></select></div>
    </div>
  );
}
