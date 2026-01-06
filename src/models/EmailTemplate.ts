import mongoose, { Document, Schema } from 'mongoose';

export type EmailTemplateCategory = 
  | 'introduction'      // First contact / cold outreach
  | 'follow_up'         // Follow-up emails
  | 'collaboration'     // Collaboration proposals
  | 'guest_post'        // Guest posting requests
  | 'link_building'     // Link building outreach
  | 'partnership'       // Business partnership
  | 'feedback_request'  // Asking for feedback
  | 'thank_you'         // Thank you / appreciation
  | 'reengagement'      // Re-engaging cold leads
  | 'custom';           // User-created custom templates

export interface IEmailTemplate extends Document {
  clerkUserId: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  bodyTemplate: string;
  variables: string[];  // Available merge tags: {{name}}, {{domain}}, {{niche}}, etc.
  isDefault: boolean;   // System-provided templates
  isActive: boolean;
  usageCount: number;
  lastUsedAt?: Date;
  tags: string[];
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: [
        'introduction',
        'follow_up',
        'collaboration',
        'guest_post',
        'link_building',
        'partnership',
        'feedback_request',
        'thank_you',
        'reengagement',
        'custom',
      ],
      default: 'custom',
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    bodyTemplate: {
      type: String,
      required: true,
    },
    variables: {
      type: [String],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsedAt: Date,
    tags: {
      type: [String],
      default: [],
    },
    description: String,
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
emailTemplateSchema.index({ clerkUserId: 1, category: 1 });
emailTemplateSchema.index({ clerkUserId: 1, isActive: 1 });

export const EmailTemplate = mongoose.model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);

// Default templates organized by category
export const DEFAULT_EMAIL_TEMPLATES: Omit<IEmailTemplate, keyof Document | 'clerkUserId' | 'createdAt' | 'updatedAt'>[] = [
  // ==================== INTRODUCTION ====================
  {
    name: 'Friendly Introduction',
    category: 'introduction',
    subject: 'Hello from a fellow {{niche}} enthusiast!',
    bodyTemplate: `Hi {{name}},

I came across your blog {{domain}} while researching {{niche}} content, and I was genuinely impressed by your work.

Your recent post about {{recent_topic}} really resonated with me. It's clear you put a lot of thought and effort into creating valuable content for your readers.

I'd love to connect and explore potential ways we could support each other's work. Would you be open to a quick chat?

Best regards,
{{sender_name}}`,
    variables: ['name', 'domain', 'niche', 'recent_topic', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['cold-outreach', 'friendly'],
    description: 'A warm, friendly introduction for initial contact with blog owners.',
  },
  {
    name: 'Professional Introduction',
    category: 'introduction',
    subject: 'Collaboration Inquiry - {{domain}}',
    bodyTemplate: `Dear {{name}},

I hope this email finds you well. My name is {{sender_name}}, and I've been following your blog {{domain}} with great interest.

Your expertise in {{niche}} is evident from the quality of your content. I particularly appreciated your insights on {{recent_topic}}.

I'm reaching out because I believe there could be mutually beneficial opportunities for collaboration between us. I'd be happy to discuss this further at your convenience.

Thank you for your time, and I look forward to hearing from you.

Best regards,
{{sender_name}}
{{sender_title}}`,
    variables: ['name', 'domain', 'niche', 'recent_topic', 'sender_name', 'sender_title'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['cold-outreach', 'professional', 'formal'],
    description: 'A professional introduction suitable for business inquiries.',
  },

  // ==================== FOLLOW UP ====================
  {
    name: 'Gentle Follow-Up',
    category: 'follow_up',
    subject: 'Just checking in - {{domain}}',
    bodyTemplate: `Hi {{name}},

I wanted to follow up on my previous email about potential collaboration opportunities.

I understand you're busy, so I'll keep this brief. I'm still very interested in connecting and would love to hear your thoughts when you have a moment.

No pressure at all - just wanted to make sure my email didn't get lost in your inbox!

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['follow-up', 'gentle'],
    description: 'A soft follow-up for when you haven\'t received a response.',
  },
  {
    name: 'Value-Add Follow-Up',
    category: 'follow_up',
    subject: 'Thought you might find this useful - {{topic}}',
    bodyTemplate: `Hi {{name}},

I was thinking about our potential collaboration and came across something I thought you'd appreciate.

{{value_content}}

I'd still love to connect and discuss how we might work together. Let me know if you'd be interested in a quick call this week.

Cheers,
{{sender_name}}`,
    variables: ['name', 'topic', 'value_content', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['follow-up', 'value-add'],
    description: 'Follow-up that provides additional value to increase response rates.',
  },

  // ==================== COLLABORATION ====================
  {
    name: 'Content Collaboration Proposal',
    category: 'collaboration',
    subject: 'Content collaboration idea for {{domain}}',
    bodyTemplate: `Hi {{name}},

I've been a fan of your work on {{domain}} for a while now, especially your content about {{niche}}.

I have an idea for a collaboration that I think could benefit both of our audiences:

{{collaboration_idea}}

This would allow us to:
• Reach new audiences in complementary niches
• Create high-value content for our readers
• Build a lasting professional relationship

Would you be interested in discussing this further? I'm happy to hop on a quick call or continue via email, whatever works best for you.

Looking forward to your thoughts!

{{sender_name}}`,
    variables: ['name', 'domain', 'niche', 'collaboration_idea', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['collaboration', 'content'],
    description: 'Propose a specific content collaboration with another blogger.',
  },
  {
    name: 'Expert Roundup Invitation',
    category: 'collaboration',
    subject: 'Invitation: Expert roundup on {{topic}}',
    bodyTemplate: `Hi {{name}},

I'm putting together an expert roundup post on "{{topic}}" and immediately thought of you given your expertise in {{niche}}.

Here's what I'm looking for:
• A short answer (2-3 paragraphs) to the question: "{{roundup_question}}"
• A brief bio and headshot (optional)
• Any links you'd like included

The post will be published on {{publication_date}} and will be promoted across our social channels ({{social_reach}} combined followers).

All contributors will receive a backlink to their site and will be featured prominently in the post.

Interested? Just reply to this email with your contribution by {{deadline}}.

Thank you!
{{sender_name}}`,
    variables: ['name', 'topic', 'niche', 'roundup_question', 'publication_date', 'social_reach', 'deadline', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['collaboration', 'roundup', 'expert'],
    description: 'Invite experts to participate in a roundup post.',
  },

  // ==================== GUEST POST ====================
  {
    name: 'Guest Post Pitch',
    category: 'guest_post',
    subject: 'Guest post idea for {{domain}}',
    bodyTemplate: `Hi {{name}},

I've been reading {{domain}} for a while and love the content you publish about {{niche}}.

I noticed you accept guest contributions, and I have some ideas that I think your audience would love:

1. {{topic_idea_1}}
2. {{topic_idea_2}}
3. {{topic_idea_3}}

A bit about me: {{sender_bio}}

Here are some examples of my previous work:
• {{sample_post_1}}
• {{sample_post_2}}

I'd be happy to create an original, in-depth article tailored specifically to your audience. Let me know if any of these topics interest you, or if you'd prefer something different!

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'niche', 'topic_idea_1', 'topic_idea_2', 'topic_idea_3', 'sender_bio', 'sample_post_1', 'sample_post_2', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['guest-post', 'pitch'],
    description: 'Pitch guest post ideas to blog owners.',
  },
  {
    name: 'Guest Post Acceptance Reply',
    category: 'guest_post',
    subject: 'Re: Guest post for {{domain}} - Ready to start!',
    bodyTemplate: `Hi {{name}},

Thank you so much for accepting my guest post pitch! I'm excited to contribute to {{domain}}.

Just to confirm, I'll be writing about: {{confirmed_topic}}

Here's my proposed outline:
{{post_outline}}

I'll have the draft ready by {{draft_deadline}}. Please let me know if you have any specific guidelines or requirements I should follow.

Looking forward to creating something great for your readers!

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'confirmed_topic', 'post_outline', 'draft_deadline', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['guest-post', 'confirmation'],
    description: 'Reply to confirm guest post details after acceptance.',
  },

  // ==================== LINK BUILDING ====================
  {
    name: 'Resource Page Link Request',
    category: 'link_building',
    subject: 'Resource suggestion for your {{page_topic}} page',
    bodyTemplate: `Hi {{name}},

I was researching {{niche}} resources and came across your excellent resource page: {{resource_page_url}}

Great collection! I noticed you've curated some really valuable links for your readers.

I recently published a comprehensive guide on {{your_content_topic}}: {{your_content_url}}

I think it could be a valuable addition to your resource page because:
• {{reason_1}}
• {{reason_2}}

Would you consider adding it? Either way, thanks for putting together such a helpful resource!

Best,
{{sender_name}}`,
    variables: ['name', 'niche', 'resource_page_url', 'page_topic', 'your_content_topic', 'your_content_url', 'reason_1', 'reason_2', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['link-building', 'resource-page'],
    description: 'Request to be added to a resource or links page.',
  },
  {
    name: 'Broken Link Outreach',
    category: 'link_building',
    subject: 'Found a broken link on {{domain}}',
    bodyTemplate: `Hi {{name}},

I was reading your article "{{article_title}}" ({{article_url}}) and noticed that one of your links appears to be broken:

❌ Broken link: {{broken_link}}

I actually have a similar resource that might be a good replacement:
✅ {{your_content_url}} - {{your_content_description}}

This covers {{topic_overlap}} and would provide your readers with the information they were looking for.

Just wanted to give you a heads up! Let me know if you'd like me to send over any additional information.

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'article_title', 'article_url', 'broken_link', 'your_content_url', 'your_content_description', 'topic_overlap', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['link-building', 'broken-link'],
    description: 'Notify about broken links and suggest your content as replacement.',
  },

  // ==================== PARTNERSHIP ====================
  {
    name: 'Business Partnership Proposal',
    category: 'partnership',
    subject: 'Partnership opportunity with {{sender_company}}',
    bodyTemplate: `Dear {{name}},

I'm {{sender_name}}, {{sender_title}} at {{sender_company}}. I've been following {{domain}} and am impressed by your work in the {{niche}} space.

I believe there's a strong opportunity for a strategic partnership between our organizations:

**Partnership Proposal:**
{{partnership_details}}

**What we bring to the table:**
• {{benefit_1}}
• {{benefit_2}}
• {{benefit_3}}

**What we're looking for:**
• {{requirement_1}}
• {{requirement_2}}

I'd love to schedule a call to discuss this in more detail. Are you available for a 30-minute chat next week?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    variables: ['name', 'domain', 'niche', 'sender_name', 'sender_title', 'sender_company', 'partnership_details', 'benefit_1', 'benefit_2', 'benefit_3', 'requirement_1', 'requirement_2'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['partnership', 'business', 'formal'],
    description: 'Propose a formal business partnership.',
  },
  {
    name: 'Affiliate Partnership',
    category: 'partnership',
    subject: 'Affiliate opportunity - {{product_name}}',
    bodyTemplate: `Hi {{name}},

I came across your blog {{domain}} and noticed your content about {{niche}}. Your audience seems like a perfect fit for {{product_name}}.

I'd like to offer you a special affiliate partnership:

💰 **Commission:** {{commission_rate}}
🎁 **Sign-up Bonus:** {{signup_bonus}}
📦 **Free Product:** Yes, for you to review

Our affiliates typically earn {{average_earnings}} per month, and we provide:
• Custom landing pages
• Marketing materials
• Dedicated affiliate support
• Monthly payouts via {{payment_method}}

Interested in learning more? I can send over our full affiliate guide and get you set up in minutes.

Cheers,
{{sender_name}}
{{sender_company}}`,
    variables: ['name', 'domain', 'niche', 'product_name', 'commission_rate', 'signup_bonus', 'average_earnings', 'payment_method', 'sender_name', 'sender_company'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['partnership', 'affiliate'],
    description: 'Propose an affiliate partnership.',
  },

  // ==================== FEEDBACK REQUEST ====================
  {
    name: 'Content Feedback Request',
    category: 'feedback_request',
    subject: 'Would love your feedback on {{content_title}}',
    bodyTemplate: `Hi {{name}},

I've long admired your work in the {{niche}} space, and I'd be honored to get your expert opinion on something.

I recently created: {{content_title}}
Link: {{content_url}}

Given your expertise, I thought you might have some valuable insights. Specifically, I'd love to know:
• {{question_1}}
• {{question_2}}

No pressure at all - I know you're busy! But if you have 5 minutes to take a look, I'd really appreciate it.

Thank you!
{{sender_name}}`,
    variables: ['name', 'niche', 'content_title', 'content_url', 'question_1', 'question_2', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['feedback', 'expert'],
    description: 'Request feedback from an expert in your niche.',
  },
  {
    name: 'Product Feedback Request',
    category: 'feedback_request',
    subject: 'Quick question about {{product_name}}',
    bodyTemplate: `Hi {{name}},

I noticed you've written about {{related_topic}} on {{domain}}, and I thought you might have some insights on our product, {{product_name}}.

We're currently {{development_stage}} and would love feedback from someone who understands the {{niche}} space.

Would you be open to a quick 15-minute call where I could:
1. Show you what we're building
2. Get your honest feedback
3. Answer any questions you might have

As a thank you, I'd be happy to {{incentive}}.

Let me know if you're interested!

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'related_topic', 'product_name', 'development_stage', 'niche', 'incentive', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['feedback', 'product'],
    description: 'Request product feedback from a potential user or expert.',
  },

  // ==================== THANK YOU ====================
  {
    name: 'Post-Interview Thank You',
    category: 'thank_you',
    subject: 'Thank you for the amazing interview!',
    bodyTemplate: `Hi {{name}},

I just wanted to send a quick note to say THANK YOU for taking the time to chat with me!

The interview was fantastic, and I know my audience is going to love hearing your insights on {{interview_topic}}.

The post will go live on {{publish_date}}. I'll send you the link as soon as it's up, and I'll be sure to tag you when we promote it on social media.

Thanks again for being so generous with your time and knowledge. I hope we can collaborate again in the future!

Warm regards,
{{sender_name}}`,
    variables: ['name', 'interview_topic', 'publish_date', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['thank-you', 'interview'],
    description: 'Thank someone for participating in an interview.',
  },
  {
    name: 'Collaboration Thank You',
    category: 'thank_you',
    subject: 'Thank you for an amazing collaboration!',
    bodyTemplate: `Hi {{name}},

I wanted to reach out and express my sincere gratitude for our recent collaboration on {{project_name}}.

The results have been incredible:
• {{result_1}}
• {{result_2}}
• {{result_3}}

Working with you was an absolute pleasure, and I hope this is just the beginning of a great partnership.

If there's ever anything I can do to support your work at {{domain}}, please don't hesitate to ask.

Thanks again!
{{sender_name}}`,
    variables: ['name', 'project_name', 'result_1', 'result_2', 'result_3', 'domain', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['thank-you', 'collaboration'],
    description: 'Thank someone for a successful collaboration.',
  },

  // ==================== REENGAGEMENT ====================
  {
    name: 'Reconnection Email',
    category: 'reengagement',
    subject: "It's been a while - {{name}}!",
    bodyTemplate: `Hi {{name}},

It's been a few months since we last connected, and I wanted to reach out to see how things are going at {{domain}}.

I've been following your recent content and really enjoyed {{recent_content}}. You're clearly doing great things!

I was thinking about our previous conversation about {{previous_topic}}, and I had some new ideas I'd love to run by you:

{{new_idea}}

Would you be open to reconnecting? I'd love to catch up and see if there are any new opportunities to collaborate.

Hope you're doing well!

Best,
{{sender_name}}`,
    variables: ['name', 'domain', 'recent_content', 'previous_topic', 'new_idea', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['reengagement', 'reconnection'],
    description: 'Reconnect with a contact you haven\'t spoken to in a while.',
  },
  {
    name: 'Win-Back Email',
    category: 'reengagement',
    subject: "We'd love to have you back, {{name}}",
    bodyTemplate: `Hi {{name}},

I noticed we haven't connected in a while, and I wanted to personally reach out.

Since we last spoke, we've made some exciting updates:
• {{update_1}}
• {{update_2}}
• {{update_3}}

I remember you were interested in {{previous_interest}}, and I think you'd find these changes valuable.

As a token of our appreciation, I'd like to offer you {{special_offer}}.

Would you be interested in reconnecting? I'd be happy to give you a quick overview of what's new.

Best,
{{sender_name}}`,
    variables: ['name', 'update_1', 'update_2', 'update_3', 'previous_interest', 'special_offer', 'sender_name'],
    isDefault: true,
    isActive: true,
    usageCount: 0,
    tags: ['reengagement', 'win-back'],
    description: 'Win back a contact or customer who has gone cold.',
  },
];

// Helper function to seed default templates for a user
export async function seedDefaultTemplates(clerkUserId: string): Promise<{
  seeded: boolean;
  count: number;
  message: string;
}> {
  const existingCount = await EmailTemplate.countDocuments({ 
    clerkUserId, 
    isDefault: true 
  });

  if (existingCount > 0) {
    return {
      seeded: false,
      count: existingCount,
      message: `Default templates already exist (${existingCount} templates)`,
    };
  }

  try {
    const templatesToCreate = DEFAULT_EMAIL_TEMPLATES.map(template => ({
      ...template,
      clerkUserId,
    }));

    const result = await EmailTemplate.insertMany(templatesToCreate);

    return {
      seeded: true,
      count: result.length,
      message: `Successfully seeded ${result.length} default templates`,
    };
  } catch (error) {
    throw new Error(`Failed to seed default templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to get templates by category
export async function getTemplatesByCategory(
  clerkUserId: string, 
  category: EmailTemplateCategory
): Promise<IEmailTemplate[]> {
  return EmailTemplate.find({ 
    clerkUserId, 
    category, 
    isActive: true 
  }).sort({ usageCount: -1 });
}

// Helper function to get all template categories with counts
export async function getTemplateCategoryCounts(clerkUserId: string): Promise<Record<EmailTemplateCategory, number>> {
  const results = await EmailTemplate.aggregate([
    { $match: { clerkUserId, isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {
    introduction: 0,
    follow_up: 0,
    collaboration: 0,
    guest_post: 0,
    link_building: 0,
    partnership: 0,
    feedback_request: 0,
    thank_you: 0,
    reengagement: 0,
    custom: 0,
  };

  results.forEach(result => {
    counts[result._id] = result.count;
  });

  return counts as Record<EmailTemplateCategory, number>;
}
