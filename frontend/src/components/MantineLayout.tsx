import { AppShell, Burger, Group, NavLink, Text, ActionIcon, Avatar, Menu, rem, Tooltip, Kbd } from '@mantine/core';
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
  IconChartBar
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';

export function MantineLayout() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const [version, setVersion] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

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
        // Silently fail - version is not critical
      }
    };

    fetchVersion();
  }, []);

  // Add keyboard shortcut for toggling sidebar (Ctrl/Cmd + B)
  useHotkeys([
    ['mod+b', () => toggleDesktop()],
  ]);

  const navItems = [
    { label: 'Dashboard', icon: IconHome, path: '/dashboard' },
    { label: 'Transactions', icon: IconReceipt, path: '/transactions' },
    { label: 'Accounts', icon: IconCreditCard, path: '/accounts' },
    { label: 'Categories', icon: IconCategory, path: '/categories' },
    { label: 'Budgets', icon: IconPigMoney, path: '/budgets' },
    { label: 'Reports', icon: IconChartBar, path: '/reports' },
  ];

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
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
              <IconPigMoney size={28} color="var(--mantine-color-yellow-5)" />
              <Text size="xl" fw={700}>
                Budget Tracker
              </Text>
            </Group>
          </Group>
          
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg">
                <Avatar color="yellow" radius="xl" size="md">
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
              
              <Menu.Divider />
              
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
                  <Menu.Item component="div" c="dimmed">
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
            © 2024 Budget Tracker
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}