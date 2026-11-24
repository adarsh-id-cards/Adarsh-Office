import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Ribbon } from "lucide-react";
import { productionService } from "@/services/productionService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/shared/PageHeader";
import { OrderItemProductionPanel } from "@/modules/production/OrderItemProductionPanel";

export function ProductionJobDetailPage(): React.ReactElement {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const { data: job, isLoading, isError } = useQuery({
    queryKey: ["production", "job", jobId],
    queryFn: () => productionService.getJob(jobId!),
    enabled: Boolean(jobId),
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Spinner label="Loading production job details..." />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Production Job Not Found</CardTitle>
          <CardDescription>The requested production job could not be loaded.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to Orders
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isCard = job.item.category === "id_card";

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{
          to: `/orders/${job.item.order_id}`,
          label: `Order ${job.item.order_number} • ${job.item.client_name}`,
        }}
        title={job.item.item_name}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isCard ? "default" : "neutral"}>
              {isCard ? (
                <>
                  <CreditCard className="h-3 w-3" />
                  ID Card Production
                </>
              ) : (
                <>
                  <Ribbon className="h-3 w-3" />
                  Lanyard Production ({job.item.lanyard_size_option_detail?.name || "Standard"})
                </>
              )}
            </Badge>
            <Badge variant={job.is_ready_for_dispatch ? "success" : "default"}>
              Stage: {job.current_stage_label}
            </Badge>
          </div>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(`/orders/${job.item.order_id}?tab=dispatch`)}
          >
            Go to Packing &amp; Dispatch
          </Button>
        }
      />

      <OrderItemProductionPanel jobId={job.id} />
    </div>
  );
}
