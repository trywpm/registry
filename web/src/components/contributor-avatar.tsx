import { User } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

export function ContributorAvatar({ name }: { name: string }) {
  return (
    <Avatar className="h-12 w-12 border-2 border-border hover:border-primary transition-colors cursor-pointer">
      <AvatarImage src="/placeholder-user.jpg" alt={name} />
      <AvatarFallback className="text-muted-foreground">
        <User className="h-6 w-6" />
      </AvatarFallback>
    </Avatar>
  );
}
