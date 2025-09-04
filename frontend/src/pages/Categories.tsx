import { useState } from 'react';
import {
  Container,
  Title,
  Paper,
  Group,
  Button,
  TextInput,
  Stack,
  ActionIcon,
  Loader,
  Center,
  Alert,
  Text,
  Grid,
  Card,
  ThemeIcon,
  Tooltip,
  Divider,
  Tabs,
} from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconCategory,
  IconEye,
  IconEyeOff,
  IconPigMoney,
  IconAlertCircle,
  IconRobot,
  IconList,
} from '@tabler/icons-react';
import { api, type CategoryWithChildren } from '../lib/api';
import { CategoryTree } from '../components/categories/CategoryTree';
import { CategoryForm } from '../components/categories/CategoryForm';
import { AutoCategorization } from '../components/categories/AutoCategorization';
import type { Category } from '../../../shared/types';

export function Categories() {
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Fetch categories
  const { data: categories, isLoading, error } = useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: async () => {
      try {
        const result = await api.getCategoryTree();
        return result;
      } catch (err) {
        console.error('[Categories Page] Error fetching categories:', err);
        throw err;
      }
    },
  });


  // Delete category mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteCategory,
    onSuccess: () => {
      notifications.show({
        title: 'Category Deleted',
        message: 'Category and its subcategories have been deleted',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete category',
        color: 'red',
      });
    },
  });

  const handleEdit = (category: Category): void => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const handleDelete = (categoryId: string): void => {
    if (window.confirm('Are you sure you want to delete this category and all its subcategories?')) {
      deleteMutation.mutate(categoryId);
    }
  };

  const handleFormClose = (): void => {
    setIsFormOpen(false);
    setEditingCategory(null);
  };

  const handleFormSuccess = (): void => {
    handleFormClose();
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  // Filter categories based on search and visibility
  const filteredCategories = categories?.filter((category: CategoryWithChildren) => {
    if (!showHidden && category.isHidden) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesParent = category.name.toLowerCase().includes(query);
      const matchesChildren = category.children?.some(
        child => child.name.toLowerCase().includes(query)
      );
      return matchesParent || matchesChildren;
    }
    
    return true;
  });

  // Calculate statistics
  const totalCategories = categories?.reduce((count: number, cat: CategoryWithChildren) => 
    count + 1 + (cat.children?.length || 0), 0
  ) || 0;
  
  const hiddenCount = categories?.reduce((count: number, cat: CategoryWithChildren) => {
    const parentHidden = cat.isHidden ? 1 : 0;
    const childrenHidden = cat.children?.filter(c => c.isHidden).length || 0;
    return count + parentHidden + childrenHidden;
  }, 0) || 0;
  
  const savingsCount = categories?.reduce((count: number, cat: CategoryWithChildren) => {
    const parentSavings = cat.isSavings ? 1 : 0;
    const childrenSavings = cat.children?.filter(c => c.isSavings).length || 0;
    return count + parentSavings + childrenSavings;
  }, 0) || 0;

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          Failed to load categories. Please try again.
        </Alert>
      </Container>
    );
  }

  const hasCategories = categories && categories.length > 0;

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Categories</Title>

        <Tabs defaultValue="categories">
          <Tabs.List>
            <Tabs.Tab value="categories" leftSection={<IconList size={16} />}>
              Categories
            </Tabs.Tab>
            <Tabs.Tab value="autocat" leftSection={<IconRobot size={16} />}>
              Auto-Categorization
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="categories" pt="lg">
            <Stack gap="lg">
              <Group justify="space-between">
                <Text size="lg" fw={500}>Manage Categories</Text>
                <Group>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setIsFormOpen(true)}
                  >
                    Add Category
                  </Button>
                </Group>
              </Group>

        {hasCategories && (
          <>
            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Card>
                  <Group gap="xs">
                    <ThemeIcon color="blue" variant="light" size="lg">
                      <IconCategory size={20} />
                    </ThemeIcon>
                    <div>
                      <Text size="xs" c="dimmed">Total Categories</Text>
                      <Text fw={600} size="lg">{totalCategories}</Text>
                    </div>
                  </Group>
                </Card>
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Card>
                  <Group gap="xs">
                    <ThemeIcon color="yellow" variant="light" size="lg">
                      <IconPigMoney size={20} />
                    </ThemeIcon>
                    <div>
                      <Text size="xs" c="dimmed">Savings Categories</Text>
                      <Text fw={600} size="lg">{savingsCount}</Text>
                    </div>
                  </Group>
                </Card>
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Card>
                  <Group gap="xs">
                    <ThemeIcon color="gray" variant="light" size="lg">
                      <IconEyeOff size={20} />
                    </ThemeIcon>
                    <div>
                      <Text size="xs" c="dimmed">Hidden Categories</Text>
                      <Text fw={600} size="lg">{hiddenCount}</Text>
                    </div>
                  </Group>
                </Card>
              </Grid.Col>
            </Grid>

            <Paper p="md" shadow="xs">
              <Group mb="md">
                <TextInput
                  flex={1}
                  placeholder="Search categories..."
                  leftSection={<IconSearch size={16} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Tooltip label={showHidden ? "Hide hidden categories" : "Show hidden categories"}>
                  <ActionIcon
                    variant={showHidden ? "filled" : "default"}
                    onClick={() => setShowHidden(!showHidden)}
                    size="lg"
                  >
                    {showHidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                  </ActionIcon>
                </Tooltip>
              </Group>

              <Divider mb="md" />

              {filteredCategories && filteredCategories.length > 0 ? (
                <CategoryTree
                  categories={filteredCategories}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  {searchQuery ? 'No categories match your search' : 'No categories to display'}
                </Text>
              )}
            </Paper>
          </>
        )}

        {!hasCategories && (
          <Paper p="xl" shadow="xs" ta="center">
            <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
              <IconCategory size={30} />
            </ThemeIcon>
            <Title order={3} mb="sm">Setting Up Categories</Title>
            <Text c="dimmed" mb="lg">
              Plaid categories are being initialized. Create your custom categories to organize transactions.
            </Text>
            <Group justify="center">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setIsFormOpen(true)}
              >
                Create Custom Category
              </Button>
            </Group>
          </Paper>
        )}

              <CategoryForm
                opened={isFormOpen}
                onClose={handleFormClose}
                category={editingCategory}
                onSuccess={handleFormSuccess}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="autocat" pt="lg">
            <AutoCategorization />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}