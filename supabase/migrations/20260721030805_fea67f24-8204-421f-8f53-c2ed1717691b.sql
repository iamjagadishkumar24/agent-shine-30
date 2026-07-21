
-- Rename active scorecard parameter labels
UPDATE public.scorecard_parameters SET name = 'Accuracy & Quality' WHERE name = 'Accuracy';
UPDATE public.scorecard_parameters SET name = 'Understanding Customer Requirements' WHERE name = 'Understanding Customer Issues';
UPDATE public.scorecard_parameters SET name = 'Customer Satisfaction (CSAT)' WHERE name = 'Customer Satisfaction';
UPDATE public.scorecard_parameters SET name = 'Average Handling Time (AHT)' WHERE name = 'Average Handling Time';
UPDATE public.scorecard_parameters SET name = 'Policy & Process Compliance' WHERE name = 'Compliance';
UPDATE public.scorecard_parameters SET name = 'Technical Accuracy / Issue Handling' WHERE name = 'Technical Accuracy / IHD';

-- Rename historical feedback_scores rows so filters and analytics stay consistent
UPDATE public.feedback_scores SET parameter_name = 'Accuracy & Quality' WHERE parameter_name = 'Accuracy';
UPDATE public.feedback_scores SET parameter_name = 'Understanding Customer Requirements' WHERE parameter_name = 'Understanding Customer Issues';
UPDATE public.feedback_scores SET parameter_name = 'Customer Satisfaction (CSAT)' WHERE parameter_name = 'Customer Satisfaction';
UPDATE public.feedback_scores SET parameter_name = 'Average Handling Time (AHT)' WHERE parameter_name = 'Average Handling Time';
UPDATE public.feedback_scores SET parameter_name = 'Policy & Process Compliance' WHERE parameter_name = 'Compliance';
UPDATE public.feedback_scores SET parameter_name = 'Technical Accuracy / Issue Handling' WHERE parameter_name = 'Technical Accuracy / IHD';
