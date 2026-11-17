"use client"

import { FolderLibraryIcon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/core/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs"
import { ArticleList } from "@/features/knowledge/components/article-list"
import { ReviewQueue } from "@/features/knowledge/components/review-queue"

interface KnowledgeViewProps {
	canManage: boolean
	canApprove: boolean
}

/** Knowledge base (KB-1): authoring for managers, the review queue for approvers. */
export function KnowledgeView({ canManage, canApprove }: KnowledgeViewProps) {
	return (
		<section className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
			<PageHeader
				icon={FolderLibraryIcon}
				title="Knowledge base"
				description="The approved content the assistant answers from. Every version needs a second person's approval."
			/>
			<Tabs defaultValue={canManage ? "articles" : "review"}>
				<TabsList>
					{canManage ? <TabsTrigger value="articles">Articles</TabsTrigger> : null}
					{canApprove ? <TabsTrigger value="review">Review queue</TabsTrigger> : null}
				</TabsList>
				{canManage ? (
					<TabsContent value="articles" className="pt-4">
						<ArticleList />
					</TabsContent>
				) : null}
				{canApprove ? (
					<TabsContent value="review" className="pt-4">
						<ReviewQueue />
					</TabsContent>
				) : null}
			</Tabs>
		</section>
	)
}
