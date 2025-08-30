import { AppShell, Burger, Group, NavLink, Text, ActionIcon, Avatar, Menu, rem } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  IconHome, 
  IconReceipt, 
  IconCreditCard,
  IconLogout,
  IconUser,
  IconPigMoney,
  IconChevronRight
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';

export function MantineLayout() {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: IconHome, path: '/dashboard' },
    { label: 'Transactions', icon: IconReceipt, path: '/transactions' },
    { label: 'Accounts', icon: IconCreditCard, path: '/accounts' },
  ];

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
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
                toggle();
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