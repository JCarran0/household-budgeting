import { AppShell, Burger, Group, NavLink, Text, ActionIcon, Avatar, Menu, rem, Tooltip, Kbd, Select } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  IconHome,
  IconReceipt,
  IconCreditCard,
  IconLogout,
  IconUser,
  IconPigMoney,
  IconChevronRight,
  IconCategory,
  IconChartBar,
  IconSettings,
  IconMessageReport,
  IconMapPin,
  IconHammer,
  IconChecklist,
  IconShoppingBag,
  IconFileInvoice,
  IconSwitchHorizontal,
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { ChangelogModal } from './ChangelogModal';
import { FeedbackModal } from './feedback/FeedbackModal';
import { ChatFAB } from './chat/ChatFAB';
import { ChatOverlay } from './chat/ChatOverlay';
import { InspirationModal } from './InspirationModal';
import { AppLogo } from './AppLogo';
import { userColor, userAvatarStyle } from '../utils/userColor';
import { useDailyInspiration } from '../hooks/useDailyInspiration';
import { useSharedAttachment } from '../hooks/useSharedAttachment';

// Nav items for the personal workspace (unchanged list — REQ-030: no Statements)
const PERSONAL_NAV = [
  { label: 'Dashboard', icon: IconHome, path: '/dashboard' },
  { label: 'Transactions', icon: IconReceipt, path: '/transactions' },
  { label: 'Accounts', icon: IconCreditCard, path: '/accounts' },
  { label: 'Categories', icon: IconCategory, path: '/categories' },
  { label: 'Budgets', icon: IconPigMoney, path: '/budgets' },
  { label: 'Reports', icon: IconChartBar, path: '/reports' },
  { label: 'Trips', icon: IconMapPin, path: '/trips' },
  { label: 'Projects', icon: IconHammer, path: '/projects' },
  { label: 'Wishlist', icon: IconShoppingBag, path: '/wishlist' },
  { label: 'Tasks', icon: IconChecklist, path: '/tasks' },
  { label: 'Admin', icon: IconSettings, path: '/admin' },
];

// Nav items for the business workspace (REQ-029: no family-only surfaces)
const BUSINESS_NAV = [
  { label: 'Transactions', icon: IconReceipt, path: '/transactions' },
  { label: 'Accounts', icon: IconCreditCard, path: '/accounts' },
  { label: 'Categories', icon: IconCategory, path: '/categories' },
  { label: 'Statements', icon: IconFileInvoice, path: '/business/statements' },
  { label: 'Admin', icon: IconSettings, path: '/admin' },
];

export function MantineLayout() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const [changelogOpened, { open: openChangelog, close: closeChangelog }] = useDisclosure(false);
  const [feedbackOpened, { open: openFeedback, close: closeFeedback }] = useDisclosure(false);
  const [chatOpened, { toggle: toggleChat, close: closeChat, open: openChat }] = useDisclosure(false);
  const sharedAttachment = useSharedAttachment();
  const [pendingSharedAttachment, setPendingSharedAttachment] = useState<File | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (sharedAttachment) {
      setPendingSharedAttachment(sharedAttachment);
      openChat();
    }
  }, [sharedAttachment, openChat]);
  const { opened: inspirationOpened, close: closeInspiration } = useDailyInspiration();
  const [version, setVersion] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, workspaces, activeWorkspaceId, switchWorkspace } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fetch version on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const versionData = await api.getVersion();
        setVersion(versionData.current);
      } catch (error) {
        console.error('Failed to fetch version:', error);
        setVersion('error loading');
      }
    };

    fetchVersion();
  }, []);

  // Add keyboard shortcut for toggling sidebar (Ctrl/Cmd + B)
  useHotkeys([
    ['mod+b', () => toggleDesktop()],
  ]);

  // Derive active workspace type for nav gating (REQ-029/030)
  const activeWorkspace = workspaces.find(ws => ws.id === activeWorkspaceId);
  const activeWorkspaceType = activeWorkspace?.workspaceType ?? 'personal';
  const navItems = activeWorkspaceType === 'business' ? BUSINESS_NAV : PERSONAL_NAV;

  // Workspace switcher: hidden when the user has ≤1 workspace (REQ-004)
  const showSwitcher = workspaces.length > 1;

  const handleSwitchWorkspace = async (familyId: string) => {
    if (familyId === activeWorkspaceId || isSwitching) return;
    setIsSwitching(true);
    try {
      await switchWorkspace(familyId);
      // Navigate to the sensible default for the new workspace type
      const targetWs = workspaces.find(ws => ws.id === familyId);
      const defaultRoute = targetWs?.workspaceType === 'business' ? '/business/statements' : '/dashboard';
      navigate(defaultRoute);
    } catch {
      notifications.show({
        color: 'red',
        title: 'Workspace switch failed',
        message: 'Could not switch workspace. Please try again.',
      });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding={0}
      data-1p-ignore
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            {/* Mobile burger - only shows on mobile */}
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              hiddenFrom="sm"
              size="sm"
            />
            {/* Desktop burger - only shows on desktop */}
            <Tooltip
              label={
                <Group gap={4}>
                  <Text size="sm">{desktopOpened ? "Collapse sidebar" : "Expand sidebar"}</Text>
                  <Kbd size="xs">⌘B</Kbd>
                </Group>
              }
              openDelay={500}
            >
              <Burger
                opened={desktopOpened}
                onClick={toggleDesktop}
                visibleFrom="sm"
                size="sm"
              />
            </Tooltip>
            <Group gap="xs">
              <AppLogo size={32} />
              <Text size="xl" fw={700}>
                Family Tracker
              </Text>
            </Group>
          </Group>

          {/* Workspace switcher — hidden when user has ≤1 workspace (REQ-004) */}
          {showSwitcher && (
            <Group gap="xs">
              <IconSwitchHorizontal size="1rem" color="gray" />
              <Select
                size="xs"
                value={activeWorkspaceId}
                onChange={(val) => { if (val) void handleSwitchWorkspace(val); }}
                data={workspaces.map(ws => ({
                  value: ws.id,
                  label: `${ws.name}${ws.workspaceType === 'business' ? ' (Business)' : ''}`,
                }))}
                disabled={isSwitching}
                style={{ minWidth: 180 }}
                aria-label="Switch workspace"
              />
            </Group>
          )}

          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg">
                <Avatar variant="filled" color={userColor(user)} radius="xl" size="md" style={userAvatarStyle(user)}>
                  {user?.username?.charAt(0).toUpperCase()}
                </Avatar>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item
                leftSection={<IconUser style={{ width: rem(14), height: rem(14) }} />}
              >
                {user?.username}
              </Menu.Item>
              
              <Menu.Item
                leftSection={<IconSettings style={{ width: rem(14), height: rem(14) }} />}
                onClick={() => navigate('/settings')}
              >
                Settings
              </Menu.Item>

              <Menu.Divider />

              <Menu.Item
                leftSection={<IconMessageReport style={{ width: rem(14), height: rem(14) }} />}
                onClick={openFeedback}
              >
                Send Feedback
              </Menu.Item>

              <Menu.Item
                color="red"
                leftSection={<IconLogout style={{ width: rem(14), height: rem(14) }} />}
                onClick={handleLogout}
              >
                Logout
              </Menu.Item>
              
              {version && (
                <>
                  <Menu.Divider />
                  <Menu.Item 
                    onClick={openChangelog}
                    style={{ cursor: 'pointer' }}
                  >
                    <Text size="xs" c="dimmed">
                      v{version}
                    </Text>
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              active={location.pathname === item.path}
              label={item.label}
              leftSection={<item.icon size="1.2rem" />}
              rightSection={<IconChevronRight size="0.9rem" stroke={1.5} />}
              onClick={() => {
                navigate(item.path);
                // Only close on mobile after navigation
                if (window.innerWidth < 768) {
                  toggleMobile();
                }
              }}
              variant="filled"
              mb="xs"
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Text size="xs" c="dimmed" ta="center">
            © 2024 Family Tracker
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <ChangelogModal
        opened={changelogOpened}
        onClose={closeChangelog}
      />

      <FeedbackModal
        opened={feedbackOpened}
        onClose={closeFeedback}
      />

      <ChatFAB onClick={toggleChat} isOpen={chatOpened} />
      <ChatOverlay
        opened={chatOpened}
        onClose={closeChat}
        initialAttachment={pendingSharedAttachment}
        onInitialAttachmentConsumed={() => setPendingSharedAttachment(null)}
      />

      <InspirationModal opened={inspirationOpened} onClose={closeInspiration} />
    </AppShell>
  );
}