'use client';

import { ClipboardCheck, Inbox } from 'lucide-react';

import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import ApproveRequests from '@/components/ApproveRequests';
import MyAccessRequests from '@/components/MyAccessRequests';

/** Asking to reach somebody else's machine, and deciding those requests.
 *
 *  Two halves of one workflow, and nothing else: the RULE about who may ask —
 *  scope, time windows, session limits — is administrator configuration and
 *  lives under Policies with the other rules. Somebody who comes here has
 *  either a request to make or a queue to work through. */
export default function RemoteAccessPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin';

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Remote Access' }]} />

      <div>
        <h1 className="text-2xl font-bold">Remote Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who may take over a machine, who has asked, and what was decided.
        </p>
      </div>

      {/* An approver's first stop is the queue; everybody else only ever has
          their own requests, so that is what the tab order follows. */}
      <Tabs defaultValue={isAdmin ? 'approve' : 'request'}>
        <TabsList className="mb-6 flex-wrap h-auto">
          <TabsTrigger value="request" className="gap-2">
            <Inbox className="h-4 w-4" />
            Access Request
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="approve" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Approve Request
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="request" className="space-y-6">
          <MyAccessRequests />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="approve" className="space-y-6">
            <ApproveRequests />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
