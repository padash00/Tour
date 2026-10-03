/**
 * F16 DS — каноническая дизайн-система публичной части. Витрина: /admin/design-system.
 * Новые экраны собираются только из этих частей; старые (components/ui.tsx, components/primitives,
 * components/lobby/ui.tsx) переводятся на них постепенно и удаляются после миграции всех экранов.
 */
export { cn } from "./cn";
export { Button, IconButton, Spinner, buttonClass, type ButtonSize, type ButtonVariant } from "./button";
export { PageTitle, SectionTitle, SubsectionTitle, Label, Meta, Eyebrow } from "./heading";
export { Container, Region, Section, Stack, Panel, InteractivePanel, RowList, DataRow, FeatureSurface, CriticalSurface, Facts, Divider, type Tone } from "./surface";
export { Status, tournamentStatus, matchStatus, registrationStatus, lobbyStatus, type StatusInfo, type StatusTone, type LobbyPhase } from "./status";
export { Field, Input, Textarea, Select, SearchInput, Checkbox, Radio, Toggle, Segmented, Slider } from "./field";
export { Dialog, Sheet, ConfirmDialog, Menu, MenuItem, MenuSeparator, Tooltip, ModalLayer, useModal } from "./overlay";
export { EmptyState, Skeleton, SkeletonRows, Callout, Steps, type StepState } from "./feedback";
export { Timer } from "./timer";
export { Avatar, TeamLogo, FaceitLevel, PlayerIdentity, TeamIdentity, Score, type AvatarSize } from "./identity";
export { ContextNav, type NavItem } from "./tabs";
export { Knife, MapSheet, SteamMark } from "./icons";
