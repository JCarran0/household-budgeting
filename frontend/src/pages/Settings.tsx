import { Container, Stack, Title } from '@mantine/core';
import { ProfileSection } from '../components/settings/ProfileSection';
import { PasswordSection } from '../components/settings/PasswordSection';
import { NotificationsSection } from '../components/settings/NotificationsSection';
import { FamilySection } from '../components/settings/FamilySection';
import { AccountOwnerMappingsSection } from '../components/settings/AccountOwnerMappingsSection';

export function Settings() {
  return (
    <Container size="md" py="xl">
      <Title order={2} mb="lg">Settings</Title>
      <Stack gap="lg">
        <ProfileSection />
        <PasswordSection />
        <NotificationsSection />
        <FamilySection />
        <AccountOwnerMappingsSection />
      </Stack>
    </Container>
  );
}
